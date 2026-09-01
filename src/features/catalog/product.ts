import { asFieldErrors } from '@/api/errors';
import { KindEnum } from '@/api/generated/model';
import type { PartDetail, PartWriteRequest, PatchedPartWriteRequest } from '@/api/generated/model';

/**
 * Everything the product form decides, with no DOM in sight.
 *
 * The same split `surgeons.ts` makes, and for the same reason: the form is
 * seven controls and a mutation, and none of the rules below need a render to
 * be tested. It is a module rather than a dialog's internals because the
 * Product Catalog's create and edit are pages, not dialogs — seven fields is
 * well past where `NameDialog`'s docstring says sharing should stop.
 *
 * Every value is a string, including the two that are not strings on the wire.
 * That is what an `<input>` holds, and converting at the edges — here, in
 * `buildProductBody` — beats scattering `Number(...)` and `?? ''` through the
 * component.
 */

export const MAX_DESCRIPTION_LENGTH = 256;
export const MAX_REFERENCE_NUMBER_LENGTH = 20;
export const MAX_UDI_LENGTH = 50;

/**
 * Two decimal places, optional, no sign.
 *
 * Mirrors the contract's `^-?\d{0,8}(?:\.\d{0,2})?$` with the minus dropped:
 * the pattern allows a negative price because it is derived from a
 * `DecimalField`, not because a catalog part can cost less than nothing.
 */
const PRICE_PATTERN = /^\d{0,8}(\.\d{1,2})?$/;

export interface ProductValues {
  manufacturer: string;
  kind: KindEnum;
  isSerialized: boolean;
  description: string;
  referenceNumber: string;
  udi: string;
  listPrice: string;
}

export function initialProductValues(): ProductValues {
  return {
    manufacturer: '',
    // Components, not kits. A kit is a bill of materials and this form cannot
    // author one, so a new kit would be an empty one — see `KIND_HINT`.
    kind: KindEnum.component,
    isSerialized: false,
    description: '',
    referenceNumber: '',
    udi: '',
    listPrice: '',
  };
}

export function seedProductValues(part: PartDetail): ProductValues {
  return {
    manufacturer: String(part.manufacturer),
    kind: part.kind,
    isSerialized: part.is_serialized,
    // `description`, never `name` — the latter is a deprecated read-only
    // alias of it, and seeding from it would write the alias back.
    description: part.description,
    referenceNumber: part.reference_number ?? '',
    udi: part.udi ?? '',
    listPrice: part.list_price ?? '',
  };
}

export interface ProductErrors {
  manufacturer?: string;
  kind?: string;
  description?: string;
  referenceNumber?: string;
  udi?: string;
  listPrice?: string;
}

/**
 * The client-side rules, and only those.
 *
 * All three uniqueness rules are absent on purpose. Reference number is unique
 * per manufacturer, UDI across the whole active catalog — including rows this
 * organization cannot see — and a kit's description per manufacturer, case
 * insensitively. Only the server can answer any of them, and it returns a 400
 * keyed on the field it judged.
 */
export function validateProduct(values: ProductValues): ProductErrors {
  const errors: ProductErrors = {};

  if (!values.manufacturer) {
    errors.manufacturer = 'Choose a manufacturer.';
  }

  const description = values.description.trim();
  if (!description) {
    errors.description = 'Enter a description.';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  const referenceNumber = values.referenceNumber.trim();
  if (referenceNumber.length > MAX_REFERENCE_NUMBER_LENGTH) {
    errors.referenceNumber = `Use ${MAX_REFERENCE_NUMBER_LENGTH} characters or fewer.`;
  }

  const udi = values.udi.trim();
  if (udi.length > MAX_UDI_LENGTH) {
    errors.udi = `Use ${MAX_UDI_LENGTH} characters or fewer.`;
  }

  const listPrice = values.listPrice.trim();
  // Checked here rather than left to the server because the server's message
  // for a malformed decimal is the regex itself.
  if (listPrice && !PRICE_PATTERN.test(listPrice)) {
    errors.listPrice = 'Enter an amount like 42.50.';
  }

  return errors;
}

export function hasProductErrors(errors: ProductErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create body.
 *
 * The four optional fields are always sent, blank included — on a create that
 * is the same as omitting them, and it keeps this function's output one shape
 * rather than one per combination of filled-in controls.
 *
 * `''` rather than `null` for the two nullable strings: `reference_number`
 * and `udi` have uniqueness constraints that exempt empty and NULL alike, so
 * either spelling of "blank" behaves identically.
 */
export function buildProductBody(values: ProductValues): PartWriteRequest {
  return {
    manufacturer: Number(values.manufacturer),
    kind: values.kind,
    is_serialized: values.isSerialized,
    description: values.description.trim(),
    reference_number: values.referenceNumber.trim(),
    udi: values.udi.trim(),
    // `null`, not `''`: the column is a decimal, and the server reads an empty
    // string as a malformed number rather than as "no price".
    list_price: values.listPrice.trim() || null,
  };
}

/**
 * The update body: only what actually changed.
 *
 * A PATCH carrying every field would be correct but noisier than it needs to
 * be, and `kind` in particular must not be sent — it is read-only on update
 * (it decides the row's identity space, stamped once at creation), so a
 * client that always sent it would be sending a key the server always drops.
 */
export function buildProductPatch(
  values: ProductValues,
  part: PartDetail,
): PatchedPartWriteRequest {
  const patch: PatchedPartWriteRequest = {};
  const seeded = seedProductValues(part);

  if (values.manufacturer !== seeded.manufacturer) {
    patch.manufacturer = Number(values.manufacturer);
  }
  if (values.isSerialized !== seeded.isSerialized) {
    patch.is_serialized = values.isSerialized;
  }
  if (values.description.trim() !== seeded.description) {
    patch.description = values.description.trim();
  }
  if (values.referenceNumber.trim() !== seeded.referenceNumber) {
    patch.reference_number = values.referenceNumber.trim();
  }
  if (values.udi.trim() !== seeded.udi) {
    patch.udi = values.udi.trim();
  }
  if (values.listPrice.trim() !== seeded.listPrice) {
    patch.list_price = values.listPrice.trim() || null;
  }

  return patch;
}

/** Whether a save would send anything at all. */
export function isUnchanged(values: ProductValues, part: PartDetail): boolean {
  return Object.keys(buildProductPatch(values, part)).length === 0;
}

const FIELD_SLOTS: Record<string, keyof ProductErrors> = {
  manufacturer: 'manufacturer',
  kind: 'kind',
  description: 'description',
  reference_number: 'referenceNumber',
  udi: 'udi',
  list_price: 'listPrice',
};

/**
 * Server field errors, mapped to the slot that renders them.
 *
 * Which field a clash lands on is the server's judgement: a duplicate catalog
 * number comes back on `reference_number`, a duplicate UDI on `udi`, and a
 * duplicate kit label on `description`. Three different findings, acted on
 * differently.
 */
export function productFieldErrors(error: unknown): ProductErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: ProductErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}

/** The field names above, for the form-level fallback to skip. */
export const PRODUCT_FIELD_KEYS = Object.keys(FIELD_SLOTS);

/**
 * The price as money, or an em dash where there is none.
 *
 * The wire carries a decimal *string* (`'42.50'`), not a number — that is how
 * the contract declares it, and parsing it to a float only to format it back
 * would introduce the rounding the string exists to avoid. So this formats the
 * currency symbol and thousands separators around the digits the server sent,
 * rather than reinterpreting them.
 */
export function formatPrice(listPrice: string | null): string {
  if (!listPrice) return '—';
  const amount = Number(listPrice);
  if (!Number.isFinite(amount)) return listPrice;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
