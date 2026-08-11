import {
  apiV1StockItemsPartialUpdate,
  createInventoryKitPhoto,
  deleteInventoryKitPhoto,
} from '@/api/generated/endpoints/inventory/inventory';
import type { PatchedInventoryKitDetailRequest } from '@/api/generated/model';

import type { PhotoOp } from './update-status';

/**
 * Saving a status change is three endpoints in a fixed order, and it can stop
 * halfway.
 *
 * Split out of the dialog because the ordering and the latch are the two things
 * most worth testing, and neither needs a DOM. `update-status-save.test.ts`
 * drives this module directly against MSW.
 */

export interface SaveState {
  /** The body, or null once the server accepted it. This is the latch. */
  pendingPatch: PatchedInventoryKitDetailRequest | null;
  /** Photo work not yet applied, in execution order. */
  pendingOps: readonly PhotoOp[];
  /** Op ids that errored on the most recent attempt, for marking tiles. */
  failedOps: readonly string[];
  /** The first error of the attempt; null when nothing failed. */
  error: unknown;
}

export function initialSaveState(
  patch: PatchedInventoryKitDetailRequest,
  ops: readonly PhotoOp[],
): SaveState {
  return { pendingPatch: patch, pendingOps: ops, failedOps: [], error: null };
}

export function isSaveComplete(state: SaveState): boolean {
  return state.pendingPatch === null && state.pendingOps.length === 0;
}

/** Whether an attempt changed anything on the server. */
export function madeProgress(before: SaveState, after: SaveState): boolean {
  return (
    (before.pendingPatch !== null && after.pendingPatch === null) ||
    after.pendingOps.length < before.pendingOps.length
  );
}

/**
 * One save attempt.
 *
 * Never rejects: a partial success is neither an error nor a success, so the
 * outcome is returned as state and the caller decides whether to close, retry
 * or show a message. No `AbortSignal` is threaded through either — abandoning
 * the sequence midway leaves the server in a state this client can no longer
 * describe.
 */
export async function runSave(kitId: number, state: SaveState): Promise<SaveState> {
  // 1. The status write, at most once per dialog session. Every PATCH appends
  //    kit-history entries ("Marked complete", "Moved to X"), so a retry that
  //    re-sent it would narrate one change twice.
  let pendingPatch = state.pendingPatch;
  if (pendingPatch !== null) {
    try {
      await apiV1StockItemsPartialUpdate(kitId, pendingPatch);
      pendingPatch = null;
    } catch (error) {
      // Nothing was written, so nothing is latched and the form stays editable
      // — the 400's field map has inputs to land under.
      return { ...state, failedOps: [], error };
    }
  }

  const remaining: PhotoOp[] = [];
  const failedOps: string[] = [];
  let firstError: unknown = null;

  // 2. Uploads first, so the kit's photo count only ever rises here. One at a
  //    time because every request shares the same 100/min per-user bucket, and
  //    a parallel burst only makes the throttle it trips harder to read. A
  //    failure does not stop the others: the ops are independent, so stopping
  //    early would just cost extra retry rounds.
  for (const op of state.pendingOps) {
    if (op.kind !== 'upload') continue;
    try {
      await createInventoryKitPhoto(kitId, { image: op.file });
    } catch (error) {
      remaining.push(op);
      failedOps.push(op.id);
      firstError ??= error;
    }
  }

  // 3. Deletions — skipped wholesale if any upload failed.
  //
  //    Not about the count dipping mid-sequence (step 2 already prevents that)
  //    but about where the save *ends*: replace a kit's only photo, have the
  //    upload fail and the deletion succeed, and the kit is left with none,
  //    permanently. Uploads are retryable and deletions are not, so when the
  //    pair is inconsistent the retryable half is the one to sacrifice.
  //
  //    Coarse on purpose — three uploads with one failure plus a deletion would
  //    still leave a photo standing. The precise rule needs the server's live
  //    count, and it is not one anybody re-derives correctly in review.
  const uploadFailed = failedOps.length > 0;
  for (const op of state.pendingOps) {
    if (op.kind !== 'delete') continue;
    if (uploadFailed) {
      // Outstanding, not failed: it was never attempted, so it marks nothing.
      remaining.push(op);
      continue;
    }
    try {
      await deleteInventoryKitPhoto(kitId, op.photoId);
    } catch (error) {
      remaining.push(op);
      failedOps.push(op.id);
      firstError ??= error;
    }
  }

  return { pendingPatch, pendingOps: remaining, failedOps, error: firstError };
}
