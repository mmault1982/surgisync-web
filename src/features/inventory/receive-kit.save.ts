import {
  createInventoryKit,
  createInventoryKitPhoto,
} from '@/api/generated/endpoints/inventory/inventory';
import type { InventoryKitDetailRequest } from '@/api/generated/model';

import type { StagedPhoto } from './receive-kit';

/**
 * Registering a kit is one create followed by N photo uploads, and it can stop
 * halfway.
 *
 * Split out of the component for the reason `update-status.save.ts` was: the
 * ordering and the latch are the two things most worth testing, and neither
 * needs a DOM. `receive-kit.save.test.ts` drives this module against MSW.
 */

export interface ReceiveSaveState {
  /**
   * The create body, or null once the server has accepted it. **This is the
   * latch, and it is the whole point of this module.**
   *
   * Once the kit exists, a retry must re-send only the outstanding photos. Drop
   * this and a second Save after one failed upload registers a *second kit* —
   * the user's mental model is "my save did not finish", and the form still
   * holds everything needed to create another one.
   */
  pendingCreate: InventoryKitDetailRequest | null;
  /** The id the server gave the kit; null until it exists. */
  kitId: number | null;
  /** Photos the server has not accepted yet, in order. */
  pendingPhotos: readonly StagedPhoto[];
  /** Keys of photos that failed on the most recent attempt, for marking tiles. */
  failedPhotos: readonly string[];
  /** The first error of the attempt; null when nothing failed. */
  error: unknown;
}

export function initialReceiveSaveState(
  body: InventoryKitDetailRequest,
  photos: readonly StagedPhoto[],
): ReceiveSaveState {
  return {
    pendingCreate: body,
    kitId: null,
    pendingPhotos: photos,
    failedPhotos: [],
    error: null,
  };
}

export function isReceiveSaveComplete(state: ReceiveSaveState): boolean {
  return state.pendingCreate === null && state.pendingPhotos.length === 0;
}

/** Whether the kit exists and only its photos are outstanding. */
export function isRetryingPhotos(state: ReceiveSaveState | null): boolean {
  return state !== null && state.pendingCreate === null && state.pendingPhotos.length > 0;
}

/**
 * One save attempt.
 *
 * Never rejects: a partial success is neither an error nor a success, so the
 * outcome comes back as state and the caller decides whether to leave, retry or
 * show a message.
 *
 * No `AbortSignal` is threaded through, for the same reason `runSave` refuses
 * one: abandoning the sequence midway leaves the server in a state this client
 * can no longer describe.
 */
export async function runReceiveSave(state: ReceiveSaveState): Promise<ReceiveSaveState> {
  let kitId = state.kitId;
  let pendingCreate = state.pendingCreate;

  // 1. The create, at most once per form session.
  if (pendingCreate !== null) {
    try {
      const kit = await createInventoryKit(pendingCreate);
      kitId = kit.id;
      pendingCreate = null;
    } catch (error) {
      // Nothing was written — `perform_create` is atomic, so even a beacon
      // conflict rolls the insert back. The latch stays unset and the form
      // stays fully editable, which is what lets the next Save create the kit
      // properly rather than patching up a half-made one.
      return { ...state, failedPhotos: [], error };
    }
  }

  if (kitId === null) {
    // Unreachable via the branch above, which either sets an id or returns.
    // Kept because the alternative is a non-null assertion on the id every
    // upload below depends on.
    return { ...state, pendingCreate, error: state.error };
  }

  // 2. The photos, one request each. Sequential because they share a per-user
  //    throttle bucket and a parallel burst only makes the 429 harder to read.
  //    A failure does not stop the others: the uploads are independent, so
  //    stopping early would just cost extra retry rounds.
  const remaining: StagedPhoto[] = [];
  const failedPhotos: string[] = [];
  let firstError: unknown = null;

  for (const photo of state.pendingPhotos) {
    try {
      await createInventoryKitPhoto(kitId, { image: photo.file });
    } catch (error) {
      remaining.push(photo);
      failedPhotos.push(photo.key);
      firstError ??= error;
    }
  }

  return { pendingCreate, kitId, pendingPhotos: remaining, failedPhotos, error: firstError };
}
