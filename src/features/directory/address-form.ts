import { asFieldErrors, errorMessage } from '@/api/errors';
import type { Address, AddressRequest, PatchedAddressRequest } from '@/api/generated/model';
import { AddressKindEnum } from '@/api/generated/model';

/**
 * Everything the address form decides, with no DOM in sight.
 *
 * The same split `manufacturer-form.ts` and `surgeons.ts` make. The value keys
 * are the wire keys for the same reason they are there: twelve fields aliased
 * through a camelCase table would be twelve more places for a rename to slip.
 *
 * ## The one place this is stricter than the server
 *
 * Every column on `Address` is `blank=True`, so `POST {}` is accepted — the
 * backend pins that deliberately, because migration 0131 backfilled partial
 * rows from `Company`'s old flat columns and a stricter API would have left
 * them unpatchable.
 *
 * So the rule here is asymmetric: **`address_line_1` and `city` are required
 * when adding, and unvalidated when amending.** Adding a blank row from a web
 * form is a mistake rather than a use case; refusing to save a row that
 * *arrived* partial would be exactly the unpatchability the backend avoided.
 * If this should be the contract's rule rather than the client's, that is a
 * backend change.
 */

export const MAX_LABEL_LENGTH = 100;
export const MAX_LINE_LENGTH = 200;
export const MAX_CITY_LENGTH = 100;
export const MAX_STATE_LENGTH = 50;
export const MAX_ZIP_LENGTH = 20;
export const MAX_COUNTRY_LENGTH = 2;
export const MAX_CONTACT_NAME_LENGTH = 100;
export const MAX_PHONE_LENGTH = 20;

/**
 * The four kinds, with the labels the model itself declares.
 *
 * Not derived from `AddressKindEnum` by title-casing: `shipping` reads
 * "Shipping / Receiving" on the server, and a client that invented
 * "Shipping" would be showing a different vocabulary from the admin.
 */
export const ADDRESS_KIND_LABELS: Record<AddressKindEnum, string> = {
  [AddressKindEnum.physical]: 'Physical',
  [AddressKindEnum.shipping]: 'Shipping / Receiving',
  [AddressKindEnum.billing]: 'Billing',
  [AddressKindEnum.mailing]: 'Mailing',
};

export const ADDRESS_KINDS = Object.keys(ADDRESS_KIND_LABELS) as AddressKindEnum[];

/** The model's own default for `country`. */
export const DEFAULT_COUNTRY = 'US';

/**
 * `country`, upper-cased, falling back to the model's default.
 *
 * Normalised in the builders rather than in `onChange`, so typing a lowercase
 * code is not fought character by character.
 */
function countryOrDefault(value: string): string {
  return value.trim().toUpperCase() || DEFAULT_COUNTRY;
}

/** The text fields, in the order the form lays them out. */
const TEXT_FIELDS = [
  'label',
  'address_line_1',
  'address_line_2',
  'city',
  'state',
  'zip_code',
  'country',
  'contact_name',
  'phone',
  'instructions',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export type AddressValues = Record<TextField, string> & {
  kind: AddressKindEnum;
  is_primary: boolean;
};

export function initialAddressValues(): AddressValues {
  const text = Object.fromEntries(TEXT_FIELDS.map((field) => [field, ''])) as Record<
    TextField,
    string
  >;
  return {
    ...text,
    // The model's default, so the form and an omitted `kind` cannot disagree.
    kind: AddressKindEnum.physical,
    is_primary: false,
    country: DEFAULT_COUNTRY,
  };
}

export function seedAddressValues(address: Address): AddressValues {
  const values = initialAddressValues();
  for (const field of TEXT_FIELDS) values[field] = address[field] ?? '';
  values.kind = address.kind ?? AddressKindEnum.physical;
  values.is_primary = address.is_primary ?? false;
  return values;
}

export type AddressErrors = Partial<Record<TextField, string>>;

const MAX_LENGTHS: Partial<Record<TextField, number>> = {
  label: MAX_LABEL_LENGTH,
  address_line_1: MAX_LINE_LENGTH,
  address_line_2: MAX_LINE_LENGTH,
  city: MAX_CITY_LENGTH,
  state: MAX_STATE_LENGTH,
  zip_code: MAX_ZIP_LENGTH,
  country: MAX_COUNTRY_LENGTH,
  contact_name: MAX_CONTACT_NAME_LENGTH,
  phone: MAX_PHONE_LENGTH,
};

/**
 * The client-side rules, and only those.
 *
 * `isNew` is what makes the street-and-city rule apply to what this form
 * creates without making an already-partial row unsaveable — see the module
 * docstring.
 */
export function validateAddress(
  values: AddressValues,
  { isNew }: { isNew: boolean },
): AddressErrors {
  const errors: AddressErrors = {};

  if (isNew) {
    if (!values.address_line_1.trim()) errors.address_line_1 = 'Enter a street address.';
    if (!values.city.trim()) errors.city = 'Enter a city.';
  }

  for (const [field, max] of Object.entries(MAX_LENGTHS) as [TextField, number][]) {
    if (values[field].trim().length > max) {
      errors[field] = `Use ${max} character${max === 1 ? '' : 's'} or fewer.`;
    }
  }

  return errors;
}

export function hasAddressErrors(errors: AddressErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create body.
 *
 * Every field is sent, blank included: on a create that is the same as omitting
 * it, and it keeps this function's output one shape rather than one per
 * combination of filled-in controls — the rule `buildProductBody` sets.
 */
export function buildAddressBody(values: AddressValues): AddressRequest {
  const body: AddressRequest = { kind: values.kind, is_primary: values.is_primary };
  for (const field of TEXT_FIELDS) body[field] = values[field].trim();
  body.country = countryOrDefault(values.country);
  return body;
}

/**
 * The update body: only what actually changed.
 *
 * `is_primary` in particular is a transition rather than a flag — sending it
 * true stands down the current primary of that kind — so re-sending an
 * unchanged `true` would ask the server to demote a sibling for no reason.
 */
export function buildAddressPatch(values: AddressValues, address: Address): PatchedAddressRequest {
  const patch: PatchedAddressRequest = {};
  for (const field of TEXT_FIELDS) {
    const value = values[field].trim();
    if (value !== (address[field] ?? '')) patch[field] = value;
  }
  // `country` is the one field on `Address` without `blank=True`, which is why
  // it alone carries `minLength: 1` in the contract — sending `''` is a 400,
  // not a clear. An emptied box therefore means "leave it alone", and a filled
  // one is normalised, so `us` does not read as a change against `US`.
  if (patch.country !== undefined) {
    const country = countryOrDefault(values.country);
    if (country === (address.country ?? '')) delete patch.country;
    else patch.country = country;
  }
  if (values.kind !== (address.kind ?? AddressKindEnum.physical)) patch.kind = values.kind;
  if (values.is_primary !== (address.is_primary ?? false)) patch.is_primary = values.is_primary;
  return patch;
}

export function isUnchanged(values: AddressValues, address: Address): boolean {
  return Object.keys(buildAddressPatch(values, address)).length === 0;
}

export function addressFieldErrors(error: unknown): AddressErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const slots = new Set<string>(TEXT_FIELDS);
  const errors: AddressErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    if (!slots.has(field) || messages.length === 0) continue;
    errors[field as TextField] = messages[0];
  }
  return errors;
}

/**
 * The form-level alert: what the server said that no field could show.
 *
 * `kind` and `is_primary` are here rather than in `AddressErrors` because
 * neither control has an error slot — one is a four-value select and the other
 * a checkbox, so anything the server says about them is a payload-level
 * finding, not a correction to a typed value.
 */
export function addressSaveErrorMessage(error: unknown): string {
  const slots = new Set<string>(TEXT_FIELDS);
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!slots.has(field) && first) return first;
  }
  return errorMessage(error);
}

/**
 * A one-line rendering of an address, for a dialog title or a confirmation.
 *
 * Falls back through label, street and city, because every one of them is
 * optional and a backfilled row may carry only one.
 */
export function addressLabel(address: Address): string {
  return (
    address.label?.trim() ||
    address.address_line_1?.trim() ||
    address.city?.trim() ||
    `${ADDRESS_KIND_LABELS[address.kind ?? AddressKindEnum.physical]} address`
  );
}
