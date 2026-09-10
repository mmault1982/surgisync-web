import { asFieldErrors, errorMessage } from '@/api/errors';
import type { ManufacturerDetail, PatchedCompanyWriteRequest } from '@/api/generated/model';

import {
  COMPANY_FIELDS,
  blankCompanyValues,
  buildCompanyPatch,
  seedCompanyValues,
  validateCompanyEmails,
  type CompanyValues,
} from './company-form';

/**
 * Everything the manufacturer form decides, with no DOM in sight.
 *
 * The same split `surgeons.ts` and `product.ts` make. It exists here because a
 * manufacturer is no longer one writable field: `NameDialog`'s docstring says a
 * second field is where sharing that component should stop, and this form has
 * eleven.
 *
 * The eleven do not all belong to the same resource, which is the fact this
 * module exists to hide from the screen. `name` is the manufacturer role's, and
 * the only field its PATCH accepts — the barcode is generated from it and
 * ownership comes from the session. The other ten belong to the `Company`
 * identity behind the role, written through `/directory/companies/{id}/`. A
 * save is therefore up to two requests, and `manufacturerSavePlan` is what
 * decides which of them are needed.
 *
 * Unlike `surgeons.ts` the value keys are the wire keys, snake_case included.
 * Ten contact fields mapped through a camelCase alias table would be ten more
 * places for a rename to go wrong, and both the patch builder and the
 * server-error mapping below become identities by keeping them the same.
 *
 * The ten themselves live in `company-form.ts` now, because Facilities writes
 * the same block through the same endpoint. What stays here is everything that
 * is about the *manufacturer* role: its one writable field, and the plan that
 * decides which of the two requests a save needs.
 */

export const MAX_NAME_LENGTH = 100;

export type ManufacturerValues = { name: string } & CompanyValues;

export function initialManufacturerValues(): ManufacturerValues {
  return { name: '', ...blankCompanyValues() };
}

export function seedManufacturerValues(record: ManufacturerDetail): ManufacturerValues {
  return { name: record.name, ...seedCompanyValues(record.company) };
}

export type ManufacturerErrors = Partial<Record<keyof ManufacturerValues, string>>;

/**
 * The client-side rules, and only those.
 *
 * Uniqueness is absent on purpose: a manufacturer's name is unique per
 * organization, case insensitively, against rows this client cannot see. Only
 * the server can answer it, and its 400 comes back keyed on `name`.
 */
export function validateManufacturer(values: ManufacturerValues): ManufacturerErrors {
  const errors: ManufacturerErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = 'Enter a name.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  // Optional, as the model has them — every contact field is blankable. But a
  // value that is present must look like an address.
  Object.assign(errors, validateCompanyEmails(values));

  return errors;
}

export function hasManufacturerErrors(errors: ManufacturerErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * What a save has to send, given what is already on the server.
 *
 * The two halves are separate requests against separate resources, so they are
 * separately skippable:
 *
 * - `renameTo` is set when creating, or when the name actually changed.
 * - `companyPatch` carries only the contact keys that changed, and is absent
 *   when none did.
 *
 * Changed-keys-only rather than all ten, for the reason `buildProductPatch`
 * states: a 400 can then only land on a field the user touched. It also makes
 * "nothing changed, so send nothing" fall out rather than needing its own
 * check.
 *
 * `record` is the server's current answer, not the one the form opened with —
 * see `manufacturer-form-screen.tsx`, which replaces it after each request that
 * lands. That is what keeps a retry after a half-applied save from re-sending
 * the half that already succeeded.
 */
export interface ManufacturerSavePlan {
  renameTo?: string;
  companyPatch?: PatchedCompanyWriteRequest;
}

export function manufacturerSavePlan(
  values: ManufacturerValues,
  record: ManufacturerDetail | null,
): ManufacturerSavePlan {
  const plan: ManufacturerSavePlan = {};
  const name = values.name.trim();

  if (!record || name !== record.name) plan.renameTo = name;

  const companyPatch = buildCompanyPatch(values, record?.company ?? null);
  if (companyPatch) plan.companyPatch = companyPatch;

  return plan;
}

/** Whether a save would send anything at all. */
export function isUnchanged(values: ManufacturerValues, record: ManufacturerDetail): boolean {
  const plan = manufacturerSavePlan(values, record);
  return plan.renameTo === undefined && plan.companyPatch === undefined;
}

/**
 * Server field errors, mapped to the slot that renders them.
 *
 * An identity map, because the value keys are the wire keys — but still a
 * filter rather than a spread: an error keyed on something this form has no
 * control for (`addresses`, which the company PATCH refuses outright, or
 * `non_field_errors`) must fall through to the form-level alert instead of
 * being dropped.
 */
export function manufacturerFieldErrors(error: unknown): ManufacturerErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const slots = new Set<string>(['name', ...COMPANY_FIELDS]);
  const errors: ManufacturerErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    if (!slots.has(field) || messages.length === 0) continue;
    errors[field as keyof ManufacturerValues] = messages[0];
  }
  return errors;
}

/**
 * The form-level alert: what the server said that no field could show.
 *
 * `non_field_errors` from a user with no resolvable organization is the one
 * that turns up in practice, and it would otherwise go unshown.
 */
export function manufacturerSaveErrorMessage(error: unknown): string {
  const slots = new Set<string>(['name', ...COMPANY_FIELDS]);
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!slots.has(field) && first) return first;
  }
  return errorMessage(error);
}
