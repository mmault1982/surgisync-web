import {
  createFacility,
  partialUpdateCompany,
  partialUpdateFacility,
} from '@/api/generated/endpoints/inventory/inventory';
import type {
  FacilityDetail,
  FacilityWriteRequest,
  PatchedCompanyWriteRequest,
  PatchedFacilityWriteRequest,
} from '@/api/generated/model';

import { facilitySavePlan, type FacilityValues } from './facility-form';

/**
 * Saving a facility is two endpoints in a fixed order, and it can stop halfway.
 *
 * A sibling of `manufacturer.save.ts` rather than a generalisation of it. The
 * two differ structurally in the first request — a manufacturer's is a bare
 * `{name}`, a facility's is a fifteen-field payload that is a different type on
 * create than on amend — so a shared version would need two type parameters and
 * five injected callbacks around a sixty-line function. That is a bigger and
 * vaguer thing than the duplicate. `catalog-column-menu.tsx` records making the
 * same call against `inventory/components/column-menu.tsx`, for the same
 * reason.
 *
 * The two endpoints are two resources. The role's own fifteen go to
 * `/directory/facilities/{id}/`; the ten contact and billing fields belong to
 * the shared `Company` identity behind it. Nesting them into one request would
 * be correct only while one `Company` backs exactly one role — which the
 * backend deliberately stopped guaranteeing, and which for facilities is the
 * likelier case rather than the exotic one: a hospital that is also a
 * manufacturer is an ordinary customer.
 */

export interface FacilitySaveState {
  /**
   * The create body, or null once the row exists. This is the latch, and it is
   * *derived* rather than remembered — see `initialFacilitySaveState`.
   */
  pendingCreate: FacilityWriteRequest | null;
  /** The facility fields to amend, or null when the server already has them. */
  pendingFacility: PatchedFacilityWriteRequest | null;
  /** The contact fields to write, or null when none changed. */
  pendingCompany: PatchedCompanyWriteRequest | null;
  /** The record as the server last returned it. Null until a create lands. */
  saved: FacilityDetail | null;
  /** The error that stopped the attempt; null when nothing failed. */
  error: unknown;
}

/**
 * What one attempt has to send.
 *
 * Built from the live form values against **the record as the server last
 * answered it**, not the one the form opened with. That is what makes the latch
 * fall out of the diff instead of needing to be remembered: after a create that
 * landed, `saved` carries the new row, so `pendingCreate` is null on the next
 * attempt and the POST cannot happen twice.
 *
 * It also means the retry after a half-failed save sends the contact fields as
 * they are *now* — which is the whole point, since the failure being recovered
 * from is almost always a 400 on one of them.
 */
export function initialFacilitySaveState(
  values: FacilityValues,
  saved: FacilityDetail | null,
): FacilitySaveState {
  const plan = facilitySavePlan(values, saved);
  return {
    pendingCreate: plan.createBody ?? null,
    pendingFacility: plan.facilityPatch ?? null,
    pendingCompany: plan.companyPatch ?? null,
    saved,
    error: null,
  };
}

export function isFacilitySaveComplete(state: FacilitySaveState): boolean {
  return (
    state.pendingCreate === null &&
    state.pendingFacility === null &&
    state.pendingCompany === null &&
    state.error === null
  );
}

/** Whether an attempt changed anything on the server. */
export function madeFacilityProgress(before: FacilitySaveState, after: FacilitySaveState): boolean {
  return (
    (before.pendingCreate !== null && after.pendingCreate === null) ||
    (before.pendingFacility !== null && after.pendingFacility === null) ||
    (before.pendingCompany !== null && after.pendingCompany === null)
  );
}

/**
 * Whether the role write landed and the company write did not.
 *
 * The state the message has to name out loud: the facility exists and its
 * contact details do not, and the obvious response to a bare failure — fill the
 * form in again and resubmit — is the one thing that must not happen. Here it
 * would file a second hospital under a name the server has already accepted
 * once and would now refuse.
 */
export function isFacilityHalfSaved(state: FacilitySaveState): boolean {
  return (
    state.error !== null &&
    state.pendingCreate === null &&
    state.pendingFacility === null &&
    state.pendingCompany !== null
  );
}

/**
 * One save attempt.
 *
 * Never rejects: a partial success is neither an error nor a success, so the
 * outcome is returned as state and the caller decides whether to leave, retry
 * or show a message.
 *
 * **Nothing is rolled back when the second write fails.** A compensating write
 * can itself answer 404, 409 or 500, and a client that fails to undo has
 * produced a state it can no longer describe. The row that survives is also the
 * correct one: the name and classification are the facility's identity and the
 * contact block is detail on it, so "the half that matters landed" beats "the
 * facility you just typed vanished". There is no un-create here in any case —
 * DELETE on this resource deactivates rather than removes, so the compensating
 * action would leave a stood-down row holding the name.
 */
export async function runFacilitySave(state: FacilitySaveState): Promise<FacilitySaveState> {
  let saved = state.saved;
  let pendingCreate = state.pendingCreate;
  let pendingFacility = state.pendingFacility;

  if (pendingCreate !== null) {
    try {
      // 201 answers the composite document, `company` included — which is what
      // lets the contact write below happen without a second read.
      saved = await createFacility(pendingCreate);
      pendingCreate = null;
    } catch (error) {
      // Nothing was written, so nothing is latched and the form stays fully
      // editable — the 400's `name` key has an input to land under.
      return { ...state, error };
    }
  } else if (pendingFacility !== null && saved !== null) {
    try {
      saved = await partialUpdateFacility(saved.id, pendingFacility);
      pendingFacility = null;
    } catch (error) {
      return { ...state, error };
    }
  }

  if (state.pendingCompany !== null && saved !== null) {
    try {
      // `company.id` off the record, never derived from the facility's. They
      // are unrelated integers, and the backend publishes this one precisely
      // so a client can notice when two roles share one identity.
      const company = await partialUpdateCompany(saved.company.id, state.pendingCompany);
      saved = { ...saved, company };
    } catch (error) {
      return { pendingCreate, pendingFacility, pendingCompany: state.pendingCompany, saved, error };
    }
  }

  return { pendingCreate, pendingFacility, pendingCompany: null, saved, error: null };
}
