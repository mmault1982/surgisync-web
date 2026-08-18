import { asConflict, asFieldErrors, errorMessage } from '@/api/errors';
import type { Manufacturer, ManufacturerWriteRequest } from '@/api/generated/model';

/**
 * Everything the manufacturer form decides, with no DOM in sight.
 *
 * The same split as `receive-sku.ts`: shape, seed, validate, payload, error
 * map. It is a much smaller form — one field — but the split is what makes the
 * error mapping testable without a render.
 */

/** Mirrors the contract's `maxLength` so the field says so before the server does. */
export const MAX_NAME_LENGTH = 100;

export interface ManufacturerValues {
  name: string;
}

export function initialManufacturerValues(): ManufacturerValues {
  return { name: '' };
}

/** The values that edit a given row — the dialog is one component, seeded twice. */
export function seedManufacturerValues(manufacturer: Manufacturer): ManufacturerValues {
  return { name: manufacturer.name };
}

export interface ManufacturerErrors {
  name?: string;
}

export function validateManufacturer(values: ManufacturerValues): ManufacturerErrors {
  const errors: ManufacturerErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = 'Enter a name.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  return errors;
}

export function hasManufacturerErrors(errors: ManufacturerErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create/update body.
 *
 * Trimmed, because the server trims too and an untrimmed name would pass the
 * client's uniqueness-free check and then collide server-side with a message
 * about a name the user cannot see the difference from.
 *
 * `name` is the only key on purpose. `barcode` is generated from it,
 * ownership comes from the session, and `is_active` is what delete writes —
 * sending any of them would be inventing a contract the server does not have.
 */
export function buildManufacturerBody(values: ManufacturerValues): ManufacturerWriteRequest {
  return { name: values.name.trim() };
}

/** True when nothing about the row would change, so the dialog can close without a request. */
export function isUnchanged(values: ManufacturerValues, manufacturer: Manufacturer): boolean {
  return values.name.trim() === manufacturer.name;
}

const FIELD_SLOTS: Record<string, keyof ManufacturerErrors> = {
  name: 'name',
};

/**
 * Server field errors, mapped to the slot that renders them.
 *
 * The one that matters is the uniqueness clash: the server answers 400 with
 * `{name: [...]}` when this organization already has that name, and it belongs
 * under the input rather than in a form-level alert the user has to connect
 * back to the field themselves.
 */
export function manufacturerFieldErrors(error: unknown): ManufacturerErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: ManufacturerErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}

/** The form-level alert: what the server said that no field could show. */
export function manufacturerSaveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}

/**
 * What went wrong deleting a manufacturer.
 *
 * The 409 is the case a user will actually hit, and it is the one the database
 * cannot catch: `Part.manufacturer` is `PROTECT`ed, but removing a manufacturer
 * is a soft delete, which never trips a foreign key — so the server checks and
 * refuses, and its message carries the part count. Branch on `error`, never the
 * prose.
 */
export function deleteErrorMessage(error: unknown): string {
  const conflict = asConflict(error);
  if (conflict?.error === 'manufacturer_in_use') return conflict.message;
  return errorMessage(error);
}

/**
 * The roles the backend's `IsOrganizationAdmin` accepts.
 *
 * Mirrors `users/permissions.py`'s `ADMIN_ROLES`. Kept as a literal rather
 * than derived from the contract because `WebUser.role` is a bare string
 * there — the enum lives in Python, so this is the seam where it has to be
 * restated, and a drift shows up as a control that 403s.
 */
const ADMIN_ROLES = new Set(['entity_global_admin', 'admin']);

/**
 * Whether to offer the write controls at all.
 *
 * This is presentation, not security — the server gates every write and is the
 * only thing that decides. What it prevents is a rep filling in a form and
 * being told 403 on submit, which is the worst possible moment to learn the
 * action was never available.
 *
 * Conservative in one direction on purpose: `WebUser` carries no
 * `is_superuser`, and the server's check passes superusers regardless of role,
 * so a superuser whose profile role is not an admin one sees no controls and
 * could still write through the API. Hiding a control someone may use beats
 * showing one most people may not.
 */
export function canManageManufacturers(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && ADMIN_ROLES.has(role);
}
