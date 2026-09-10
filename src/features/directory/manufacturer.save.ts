import {
  createManufacturerCatalog,
  partialUpdateCompany,
  partialUpdateManufacturerCatalog,
} from '@/api/generated/endpoints/inventory/inventory';
import type { ManufacturerDetail, PatchedCompanyWriteRequest } from '@/api/generated/model';

import { manufacturerSavePlan, type ManufacturerValues } from './manufacturer-form';

/**
 * Saving a manufacturer is two endpoints in a fixed order, and it can stop
 * halfway.
 *
 * Split out of the form for the reason `update-status.save.ts` states about the
 * same shape: the ordering and the latch are the two things most worth testing,
 * and neither needs a DOM. `manufacturer.save.test.ts` drives this module
 * directly against MSW.
 *
 * The two endpoints are two resources. `name` is the manufacturer role's and is
 * the only field its write accepts; the ten contact and billing fields belong
 * to the shared `Company` identity behind it. Nesting them into one request
 * would be correct only while one `Company` backs exactly one role — which the
 * backend deliberately stopped guaranteeing.
 */

export interface ManufacturerSaveState {
  /**
   * The name to write, or null when the server already has it. This is the
   * latch, and it is *derived* rather than remembered — see
   * `initialManufacturerSaveState`.
   */
  pendingName: string | null;
  /** The contact fields to write, or null when none changed. */
  pendingCompany: PatchedCompanyWriteRequest | null;
  /** The record as the server last returned it. Null until a create lands. */
  saved: ManufacturerDetail | null;
  /** The error that stopped the attempt; null when nothing failed. */
  error: unknown;
}

/**
 * What one attempt has to send.
 *
 * Built from the live form values against **the record as the server last
 * answered it**, not the one the form opened with. That is what makes the latch
 * fall out of the diff instead of needing to be remembered: after a create that
 * landed, `saved` carries the new name, so `pendingName` is null on the next
 * attempt and the POST cannot happen twice.
 *
 * It also means the retry after a half-failed save sends the contact fields as
 * they are *now* — which is the whole point, since the failure being recovered
 * from is almost always a 400 on one of them.
 */
export function initialManufacturerSaveState(
  values: ManufacturerValues,
  saved: ManufacturerDetail | null,
): ManufacturerSaveState {
  const plan = manufacturerSavePlan(values, saved);
  return {
    pendingName: plan.renameTo ?? null,
    pendingCompany: plan.companyPatch ?? null,
    saved,
    error: null,
  };
}

export function isManufacturerSaveComplete(state: ManufacturerSaveState): boolean {
  return state.pendingName === null && state.pendingCompany === null && state.error === null;
}

/** Whether an attempt changed anything on the server. */
export function madeManufacturerProgress(
  before: ManufacturerSaveState,
  after: ManufacturerSaveState,
): boolean {
  return (
    (before.pendingName !== null && after.pendingName === null) ||
    (before.pendingCompany !== null && after.pendingCompany === null)
  );
}

/**
 * Whether the role write landed and the company write did not.
 *
 * The state the message has to name out loud: the manufacturer exists and its
 * contact details do not, and the obvious response to a bare failure — fill the
 * form in again and resubmit — is the one thing that must not happen.
 */
export function isHalfSaved(state: ManufacturerSaveState): boolean {
  return state.error !== null && state.pendingName === null && state.pendingCompany !== null;
}

/**
 * One save attempt.
 *
 * Never rejects: a partial success is neither an error nor a success, so the
 * outcome is returned as state and the caller decides whether to leave, retry
 * or show a message.
 *
 * **Nothing is rolled back when the second write fails.** A compensating
 * `DELETE` can itself answer 404, 409 or 500, and a client that fails to
 * un-create has produced a state it can no longer describe. The row that
 * survives is also the correct one: the name is the manufacturer's identity and
 * the contact block is detail on it, so "the half that matters landed" beats
 * "the manufacturer you just typed vanished".
 */
export async function runManufacturerSave(
  state: ManufacturerSaveState,
): Promise<ManufacturerSaveState> {
  let saved = state.saved;
  let pendingName = state.pendingName;

  if (pendingName !== null) {
    try {
      saved = saved
        ? await partialUpdateManufacturerCatalog(saved.id, { name: pendingName })
        : await createManufacturerCatalog({ name: pendingName });
      pendingName = null;
    } catch (error) {
      // Nothing was written, so nothing is latched and the form stays fully
      // editable — the 400's `name` key has an input to land under.
      return { ...state, error };
    }
  }

  if (state.pendingCompany !== null && saved !== null) {
    try {
      // `company.id` off the record, never derived from the manufacturer's.
      // They are unrelated integers, and the backend publishes this one
      // precisely so a client can notice when two roles share one identity.
      const company = await partialUpdateCompany(saved.company.id, state.pendingCompany);
      saved = { ...saved, company };
    } catch (error) {
      return { pendingName, pendingCompany: state.pendingCompany, saved, error };
    }
  }

  return { pendingName, pendingCompany: null, saved, error: null };
}
