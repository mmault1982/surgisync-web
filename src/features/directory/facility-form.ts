import { asFieldErrors, errorMessage } from '@/api/errors';
import type {
  FacilityDetail,
  FacilityWriteRequest,
  PatchedCompanyWriteRequest,
  PatchedFacilityWriteRequest,
} from '@/api/generated/model';
import { AccreditationStatusEnum, FacilityTypeEnum } from '@/api/generated/model';

import {
  COMPANY_FIELDS,
  blankCompanyValues,
  buildCompanyPatch,
  seedCompanyValues,
  validateCompanyEmails,
  type CompanyValues,
} from './company-form';

/**
 * Everything the facility form decides, with no DOM in sight.
 *
 * A sibling of `manufacturer-form.ts` rather than a generalisation of it — the
 * call `catalog-column-menu.tsx` records making against
 * `inventory/components/column-menu.tsx`. The two share the `Company` half,
 * which is why `company-form.ts` exists; what is left differs enough that one
 * module serving both would be mostly type parameters. A manufacturer's PATCH
 * accepts one field. A facility's accepts fifteen.
 *
 * The value keys are the wire keys, snake_case included, for the reason
 * `manufacturer-form.ts` gives: it makes the patch builder and the
 * server-error mapping identities rather than translation tables.
 *
 * ## Two writable fields are deliberately not here
 *
 * The PATCH accepts `is_active` and `onboarding_status`; neither has a key on
 * `FacilityValues`, so `facilitySavePlan` is structurally incapable of
 * emitting either. They are absent for different reasons.
 *
 * `is_active` is how a deactivated facility comes back, and a control labelled
 * "Active" sitting three inches from "Contact phone" is how someone stands a
 * hospital down while fixing a typo. Activation is a deliberate act with its
 * own confirmation, and it lives on the list screen. Do not add it here "for
 * completeness".
 *
 * `onboarding_status` is not wanted on the detail and form screens. The list
 * still shows it as a column and filters on it, so the labels in
 * `facility-labels.ts` stay; what is gone is any way to *write* it from this
 * app. On create the key is omitted and the model's own default
 * (`not_started`) applies, which is exactly what this form used to send
 * explicitly; on amend it never diffs, so whatever the row carries survives.
 *
 * ## Two spellings of blank, in one payload
 *
 * This is the part to be careful about, and the reason the tests are densest
 * around `facilitySavePlan`:
 *
 * - The seven text fields and `notes` blank to `''`. They are `blank=True`
 *   CharFields, and `''` is what clears them.
 * - The two dates blank to **`null`**. They are `null=True` DateFields, and
 *   `''` is not a valid date — sending it is a 400, not a clear.
 * - `accreditation_status` blanks to `''`, not null. The contract declares it
 *   `oneOf: [AccreditationStatusEnum, BlankEnum]`, so the empty string is a
 *   legal enum member there.
 *
 * Get the second one wrong and clearing a licence expiry either 400s or
 * silently does nothing.
 */

export const MAX_NAME_LENGTH = 200;

/** The free-text fields, in the order the form lays them out. */
export const FACILITY_TEXT_FIELDS = [
  'gpo_affiliation',
  'gpo_member_id',
  'idn_affiliation',
  'npi_number',
  'tax_id',
  'dea_number',
  'state_license_number',
  'notes',
] as const;

export type FacilityTextField = (typeof FACILITY_TEXT_FIELDS)[number];

/** The two nullable dates, which blank to `null` rather than `''`. */
export const FACILITY_DATE_FIELDS = [
  'state_license_expiration',
  'accreditation_expiration',
] as const;

export type FacilityDateField = (typeof FACILITY_DATE_FIELDS)[number];

export const MAX_LENGTHS: Record<FacilityTextField, number | null> = {
  gpo_affiliation: 200,
  gpo_member_id: 50,
  idn_affiliation: 200,
  npi_number: 10,
  tax_id: 20,
  dea_number: 9,
  state_license_number: 50,
  // A TextField, so the contract declares no maxLength and neither do we.
  notes: null,
};

/** Mirrors the serializer's `RegexField`: ten digits, or nothing at all. */
const NPI_PATTERN = /^(\d{10})?$/;

/** Likewise: two letters then seven digits, or nothing at all. */
const DEA_PATTERN = /^([A-Z]{2}\d{7})?$/;

/**
 * `dea_number`, upper-cased.
 *
 * Normalised in the builders rather than in `onChange`, so typing lowercase is
 * not fought character by character — the same move `address-form.ts` makes
 * for `country`. Validation reads the normalised value too, so `ab1234567` is
 * accepted rather than rejected for a case the client is about to fix.
 */
function normaliseDea(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * The accreditation value a form control holds.
 *
 * `AccreditationStatusEnum | ''` rather than one of orval's three structurally
 * identical combined aliases (`FacilityDetailAccreditationStatus` and friends).
 * They are generated names for one idea, and picking one of them here would
 * make this module's public type depend on which request shape orval happened
 * to name first.
 */
export type AccreditationValue = AccreditationStatusEnum | '';

export type FacilityValues = {
  name: string;
  facility_type: FacilityTypeEnum;
  accreditation_status: AccreditationValue;
} & Record<FacilityTextField, string> &
  Record<FacilityDateField, string> &
  CompanyValues;

export function initialFacilityValues(): FacilityValues {
  const text = Object.fromEntries(FACILITY_TEXT_FIELDS.map((f) => [f, ''])) as Record<
    FacilityTextField,
    string
  >;
  const dates = Object.fromEntries(FACILITY_DATE_FIELDS.map((f) => [f, ''])) as Record<
    FacilityDateField,
    string
  >;
  return {
    name: '',
    // The model's own defaults, so an untouched create form shows what the
    // server would have chosen anyway rather than a blank the user must fill.
    facility_type: FacilityTypeEnum.hospital,
    accreditation_status: '',
    ...text,
    ...dates,
    ...blankCompanyValues(),
  };
}

/**
 * Every value is a string (or a known enum member), including the ones that are
 * nullable on the wire. That is what an `<input>` holds, and converting at the
 * edges — here and in `facilitySavePlan` — beats scattering `?? ''` through the
 * component.
 */
export function seedFacilityValues(record: FacilityDetail): FacilityValues {
  const values = initialFacilityValues();
  values.name = record.name;
  values.facility_type = record.facility_type ?? FacilityTypeEnum.hospital;
  values.accreditation_status = record.accreditation_status ?? '';
  for (const field of FACILITY_TEXT_FIELDS) values[field] = record[field] ?? '';
  // `?? ''` collapses null to the empty box the date control renders as "no
  // date". The reverse conversion is in the plan builder, and it is the half
  // that has to send null rather than ''.
  for (const field of FACILITY_DATE_FIELDS) values[field] = record[field] ?? '';
  return { ...values, ...seedCompanyValues(record.company) };
}

export type FacilityErrors = Partial<Record<keyof FacilityValues, string>>;

/**
 * The client-side rules, and only those.
 *
 * Uniqueness is absent on purpose: a facility's name is unique per
 * organization, case insensitively, against rows this client cannot see —
 * including deactivated ones, which keep their name. Only the server can
 * answer it, and its 400 comes back keyed on `name` with copy that says so.
 */
export function validateFacility(values: FacilityValues): FacilityErrors {
  const errors: FacilityErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = 'Enter a name.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  for (const field of FACILITY_TEXT_FIELDS) {
    const max = MAX_LENGTHS[field];
    if (max !== null && values[field].trim().length > max) {
      errors[field] = `Use ${max} characters or fewer.`;
    }
  }

  // Both are optional, as the model has them — a facility can be recorded
  // before anyone has looked its numbers up. A value that is present must be
  // the right shape.
  if (!NPI_PATTERN.test(values.npi_number.trim())) {
    errors.npi_number = 'An NPI is exactly 10 digits.';
  }
  if (!DEA_PATTERN.test(normaliseDea(values.dea_number))) {
    errors.dea_number = 'A DEA number is two letters then seven digits, e.g. AB1234567.';
  }

  Object.assign(errors, validateCompanyEmails(values));

  return errors;
}

export function hasFacilityErrors(errors: FacilityErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * A date box's value as the wire wants it: the string, or `null` to clear.
 *
 * The whole reason this is a function rather than a ternary at each call site
 * is that `''` and `null` are not interchangeable here — see the module
 * docstring.
 */
function dateOrNull(value: string): string | null {
  return value.trim() || null;
}

/**
 * What a save has to send, given what is already on the server.
 *
 * Two resources, so two separately skippable halves:
 *
 * - `createBody` when there is no record yet — the full write payload, since
 *   there is nothing to diff against.
 * - `facilityPatch` when amending, carrying only the keys that changed.
 * - `companyPatch` carrying only the contact keys that changed, absent when
 *   none did.
 *
 * `record` is the server's current answer, not the one the form opened with —
 * see `facility-form-screen.tsx`, which replaces it after each request that
 * lands. That is what keeps a retry after a half-applied save from re-sending
 * the half that already succeeded.
 */
export interface FacilitySavePlan {
  createBody?: FacilityWriteRequest;
  facilityPatch?: PatchedFacilityWriteRequest;
  companyPatch?: PatchedCompanyWriteRequest;
}

export function facilitySavePlan(
  values: FacilityValues,
  record: FacilityDetail | null,
): FacilitySavePlan {
  const plan: FacilitySavePlan = {};

  if (!record) {
    const body: FacilityWriteRequest = {
      name: values.name.trim(),
      facility_type: values.facility_type,
      accreditation_status: values.accreditation_status,
    };
    for (const field of FACILITY_TEXT_FIELDS) body[field] = values[field].trim();
    body.dea_number = normaliseDea(values.dea_number);
    for (const field of FACILITY_DATE_FIELDS) body[field] = dateOrNull(values[field]);
    plan.createBody = body;
  } else {
    const patch: PatchedFacilityWriteRequest = {};
    const name = values.name.trim();
    if (name !== record.name) patch.name = name;
    if (values.facility_type !== (record.facility_type ?? FacilityTypeEnum.hospital)) {
      patch.facility_type = values.facility_type;
    }
    if (values.accreditation_status !== (record.accreditation_status ?? '')) {
      patch.accreditation_status = values.accreditation_status;
    }
    for (const field of FACILITY_TEXT_FIELDS) {
      const value = field === 'dea_number' ? normaliseDea(values[field]) : values[field].trim();
      // `?? ''` on the right, because absent and empty are the same thing for
      // these: the server renders every blankable CharField as `''`, but a
      // client holding an older document should not read a missing key as a
      // change.
      if (value !== (record[field] ?? '')) patch[field] = value;
    }
    for (const field of FACILITY_DATE_FIELDS) {
      // Compared as `''`, sent as `null`. Comparing the two `null`s directly
      // would work, but comparing what the *box* holds against what the record
      // would seed into it is the same rule `seedFacilityValues` applies, and
      // keeping them symmetrical is what stops an untouched empty date from
      // reading as a change.
      const value = dateOrNull(values[field]);
      if ((value ?? '') !== (record[field] ?? '')) patch[field] = value;
    }
    if (Object.keys(patch).length > 0) plan.facilityPatch = patch;
  }

  const companyPatch = buildCompanyPatch(values, record?.company ?? null);
  if (companyPatch) plan.companyPatch = companyPatch;

  return plan;
}

/** Whether a save would send anything at all. */
export function isUnchanged(values: FacilityValues, record: FacilityDetail): boolean {
  const plan = facilitySavePlan(values, record);
  return plan.facilityPatch === undefined && plan.companyPatch === undefined;
}

/**
 * Server field errors, mapped to the slot that renders them.
 *
 * An identity map, because the value keys are the wire keys — but still a
 * filter rather than a spread: an error keyed on something this form has no
 * control for (`is_active`, which is not on it by design, or
 * `non_field_errors`) must fall through to the form-level alert instead of
 * being dropped.
 */
const ERROR_SLOTS = new Set<string>([
  'name',
  'facility_type',
  'accreditation_status',
  ...FACILITY_TEXT_FIELDS,
  ...FACILITY_DATE_FIELDS,
  ...COMPANY_FIELDS,
]);

export function facilityFieldErrors(error: unknown): FacilityErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: FacilityErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    if (!ERROR_SLOTS.has(field) || messages.length === 0) continue;
    errors[field as keyof FacilityValues] = messages[0];
  }
  return errors;
}

/**
 * The form-level alert: what the server said that no field could show.
 *
 * `non_field_errors` from a user with no resolvable organization is the one
 * that turns up in practice — the create endpoint raises exactly that — and it
 * would otherwise go unshown.
 */
export function facilitySaveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!ERROR_SLOTS.has(field) && first) return first;
  }
  return errorMessage(error);
}
