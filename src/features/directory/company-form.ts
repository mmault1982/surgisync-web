import type { Company, PatchedCompanyWriteRequest } from '@/api/generated/model';

/**
 * The shared `Company` identity's contact block, as a form holds it.
 *
 * Extracted from `manufacturer-form.ts` when Facilities became the second role
 * to write these ten fields — the move `field.tsx`, `delete-dialog.tsx` and
 * `table-states.tsx` each record making on their own second caller.
 *
 * The list of ten is the thing worth sharing rather than the validation around
 * it: it is the wire shape of `PatchedCompanyWriteRequest`, and two copies of
 * it is how an eleventh contact column ends up written in one form and not the
 * other. `manufacturer-form.ts` and `facility-form.ts` both import from here
 * and neither redeclares it.
 *
 * Deliberately **not** a whole form module. Nothing here knows about a role's
 * own fields, its validation rules or its save plan, because those are where
 * the two genuinely differ — a manufacturer's PATCH takes one field and a
 * facility's takes fifteen.
 *
 * As in the modules it came from, the value keys are the wire keys, snake_case
 * included. Ten contact fields mapped through a camelCase alias table would be
 * ten more places for a rename to go wrong, and both the patch builder and the
 * server-error mapping become identities by keeping them the same.
 */

/** The `Company` fields these forms write, in the order they are laid out. */
export const COMPANY_FIELDS = [
  'phone',
  'fax',
  'email',
  'contact_name',
  'contact_title',
  'contact_email',
  'contact_phone',
  'billing_contact_name',
  'billing_contact_email',
  'billing_contact_phone',
] as const;

export type CompanyField = (typeof COMPANY_FIELDS)[number];

export type CompanyValues = Record<CompanyField, string>;

/** The three fields the server holds to an email shape. */
export const COMPANY_EMAIL_FIELDS = ['email', 'contact_email', 'billing_contact_email'] as const;

/**
 * Loose on purpose: something before an `@`, something after it, and a dot in
 * the tail. Mirroring Django's own `EmailValidator` here would be a second
 * spelling of a rule only the server can enforce — this catches the typo that
 * would otherwise cost a round trip, and leaves the judgement where it lives.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function blankCompanyValues(): CompanyValues {
  return Object.fromEntries(COMPANY_FIELDS.map((field) => [field, ''])) as CompanyValues;
}

/**
 * Every value is a string, including the ten that are optional on the wire.
 * That is what an `<input>` holds, and converting at the edges — here and in
 * `buildCompanyPatch` — beats scattering `?? ''` through the components.
 */
export function seedCompanyValues(company: Company): CompanyValues {
  const values = blankCompanyValues();
  for (const field of COMPANY_FIELDS) values[field] = company[field] ?? '';
  return values;
}

/**
 * The email-shape rule, and only that.
 *
 * Every contact field is blankable server-side, so an empty box is valid; a
 * value that is present must look like an address. Returns wire-keyed entries
 * so a caller can spread them straight into its own error object.
 */
export function validateCompanyEmails(values: CompanyValues): Partial<CompanyValues> {
  const errors: Partial<CompanyValues> = {};
  for (const field of COMPANY_EMAIL_FIELDS) {
    const value = values[field].trim();
    if (value && !EMAIL_PATTERN.test(value)) {
      errors[field] = 'Enter a valid email address.';
    }
  }
  return errors;
}

/**
 * The contact keys that actually changed, or `undefined` when none did.
 *
 * Changed-keys-only rather than all ten, for the reason `buildProductPatch`
 * states: a 400 can then only land on a field the user touched. It also makes
 * "nothing changed, so send nothing" fall out rather than needing its own
 * check.
 *
 * `company` is null while creating, when every non-empty field is a change.
 */
export function buildCompanyPatch(
  values: CompanyValues,
  company: Company | null,
): PatchedCompanyWriteRequest | undefined {
  const patch: PatchedCompanyWriteRequest = {};
  for (const field of COMPANY_FIELDS) {
    const value = values[field].trim();
    // `?? ''` on the right, because absent and empty are the same thing here:
    // the server renders every blankable CharField as `''`, but a client
    // holding an older document should not read a missing key as a change.
    if (value !== (company?.[field] ?? '')) patch[field] = value;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}
