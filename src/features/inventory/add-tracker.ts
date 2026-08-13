import { asConflict, errorMessage } from '@/api/errors';
import type { PatchedInventoryKitDetailRequest } from '@/api/generated/model';

/**
 * Attaching a Hansel tracker: one field, one request.
 *
 * Small enough that the only thing worth keeping out of the component is the
 * part with rules — what counts as submittable, and what a 409 means.
 */

/**
 * Whether the field holds something worth sending.
 *
 * Not a nicety. `attach_beacon` (`tracking/services.py`) strips the value and
 * returns `None` for a blank one **without attaching anything**, and the PATCH
 * still answers 200 — so an empty submit would close the dialog on a success
 * that did nothing at all. This check is the only thing preventing that.
 */
export function canSubmitBeacon(beaconId: string): boolean {
  return beaconId.trim().length > 0;
}

/**
 * The whole body.
 *
 * One field, deliberately: this is a PATCH, so everything else is left alone by
 * omission. Spreading the kit in here — the way a status update legitimately
 * does — would rewrite fields nobody touched.
 */
export function buildTrackerPatch(beaconId: string): PatchedInventoryKitDetailRequest {
  return { beacon_id: beaconId.trim() };
}

/**
 * Copy for the two conflicts the contract documents, keyed by the machine code
 * rather than the server's prose, per `CLAUDE.md`.
 *
 * Mobile's wording, which is more useful than the server's `message` because it
 * says what to do next rather than only what went wrong. An unknown code falls
 * back to that `message`, so a conflict added later still reaches the user with
 * whatever the server chose to say.
 */
const CONFLICT_COPY: Record<string, string> = {
  beacon_in_use:
    'This tracker is already associated with a different item. Please detach from that first, or use a different tracker.',
  kit_has_tracker: 'This item already has a tracker attached.',
};

/**
 * What to show under the field.
 *
 * Every failure lands here rather than in a form-level alert: there is one
 * input, so every error is about the value in it.
 */
export function trackerErrorMessage(error: unknown): string {
  const conflict = asConflict(error);
  if (conflict) return CONFLICT_COPY[conflict.error] ?? conflict.message;
  return errorMessage(error);
}
