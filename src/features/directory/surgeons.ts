import { asFieldErrors } from '@/api/errors';
import type { SurgeonCatalog, SurgeonWriteRequest } from '@/api/generated/model';

/**
 * Everything the surgeon form decides, with no DOM in sight.
 *
 * Surgeons is the first directory entity with two writable fields, so unlike
 * manufacturers and procedures it does not go through `NameDialog` — whose
 * docstring says that a second field is where sharing that component should
 * stop. This is the module that dialog would otherwise have needed a `fields`
 * prop to serve.
 */

export const MAX_NAME_LENGTH = 100;

/** Mirrors `npi_validator` on the model: ten digits, or nothing at all. */
const NPI_PATTERN = /^\d{10}$/;

export interface SurgeonValues {
  name: string;
  npiNumber: string;
}

export function initialSurgeonValues(): SurgeonValues {
  return { name: '', npiNumber: '' };
}

export function seedSurgeonValues(surgeon: SurgeonCatalog): SurgeonValues {
  return { name: surgeon.name, npiNumber: surgeon.npi_number ?? '' };
}

export interface SurgeonErrors {
  name?: string;
  npiNumber?: string;
}

/**
 * The client-side rules, and only those.
 *
 * Uniqueness is absent on purpose: it is decided against the NPI first and the
 * name only as a fallback, across both lists the caller can see, so only the
 * server can answer it. Its 400 comes back keyed on whichever field it judged.
 */
export function validateSurgeon(values: SurgeonValues): SurgeonErrors {
  const errors: SurgeonErrors = {};
  const name = values.name.trim();
  const npi = values.npiNumber.trim();

  if (!name) {
    errors.name = 'Enter a name.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  // Optional, as the model has it — a surgeon can be recorded before anyone
  // has looked their number up. But a value that is present must be valid.
  if (npi && !NPI_PATTERN.test(npi)) {
    errors.npiNumber = 'An NPI is exactly 10 digits.';
  }

  return errors;
}

export function hasSurgeonErrors(errors: SurgeonErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create/update body.
 *
 * `npi_number` is always sent, blank included: on a PATCH that is what clears
 * a number entered by mistake. Omitting the key would leave the old value in
 * place, which is the opposite of what an emptied field means.
 */
export function buildSurgeonBody(values: SurgeonValues): SurgeonWriteRequest {
  return { name: values.name.trim(), npi_number: values.npiNumber.trim() };
}

export function isUnchanged(values: SurgeonValues, surgeon: SurgeonCatalog): boolean {
  return (
    values.name.trim() === surgeon.name && values.npiNumber.trim() === (surgeon.npi_number ?? '')
  );
}

const FIELD_SLOTS: Record<string, keyof SurgeonErrors> = {
  name: 'name',
  npi_number: 'npiNumber',
};

/**
 * Server field errors, mapped to the slot that renders them.
 *
 * Which field a clash lands on is the server's judgement, not ours: a
 * duplicate NPI comes back on `npi_number` and a duplicate name on `name`,
 * because those are different findings and the user acts on them differently.
 */
export function surgeonFieldErrors(error: unknown): SurgeonErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: SurgeonErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}
