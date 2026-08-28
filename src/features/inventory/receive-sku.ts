import { asFieldErrors, errorMessage } from '@/api/errors';
import type { InventoryKitDetailRequest, OwnershipTypeEnum, PartList } from '@/api/generated/model';

import type { StagedPhoto } from './receive-kit';

/**
 * Everything the SKU / Manual form decides, with no DOM in sight.
 *
 * Sibling of `receive-kit.ts`, and the differences are the interesting part:
 * a SKU is found by typing a catalog number rather than picked from a list, it
 * carries a quantity the part itself may forbid, and saving one leaves the form
 * ready for the next rather than leaving the screen.
 *
 * The network half is shared: `receive.save.ts` posts to the same
 * `/stock-items/` endpoint and the same photos sub-resource.
 */

export const MAX_QUANTITY = 100_000;

/** `udi` is `maxLength: 128` and `lot_code` `maxLength: 64` on the contract. */
export const MAX_UDI_LENGTH = 128;
export const MAX_LOT_CODE_LENGTH = 64;

export interface ReceiveSkuValues {
  manufacturerId: number | null;
  representativeId: number | null;
  physicalLocation: string;
  catalogNumber: string;
  quantity: string;
  ownershipType: OwnershipTypeEnum;
  expirationDate: string;
  udi: string;
  lotCode: string;
  notes: string;
}

export function initialSkuValues(): ReceiveSkuValues {
  return {
    manufacturerId: null,
    representativeId: null,
    physicalLocation: '',
    catalogNumber: '',
    // Text-backed, so the field holds whatever was typed until submit judges
    // it. A number here would make an empty box indistinguishable from zero.
    quantity: '1',
    ownershipType: 'consigned',
    expirationDate: '',
    udi: '',
    lotCode: '',
    notes: '',
  };
}

/**
 * The per-item fields, cleared after a save.
 *
 * Manufacturer, Rep, Physical Location and Type describe the *session* and
 * survive, because SKU mode is for loading items one after another out of the
 * same delivery — re-picking all four per item is the friction mobile
 * deliberately avoids (`_resetSkuForm`).
 */
export function resetSkuItem(values: ReceiveSkuValues): ReceiveSkuValues {
  return {
    ...values,
    catalogNumber: '',
    quantity: '1',
    expirationDate: '',
    udi: '',
    lotCode: '',
    notes: '',
  };
}

export interface ReceiveSkuErrors {
  manufacturer?: string;
  representative?: string;
  location?: string;
  catalogNumber?: string;
  quantity?: string;
  expirationDate?: string;
  udi?: string;
  lotCode?: string;
  photos?: string;
  notes?: string;
}

/** Whether the part forbids a quantity other than 1. */
export function isQuantityLocked(part: PartList | null): boolean {
  return part?.is_serialized === true;
}

/**
 * The quantity as a number, or null when the field does not hold one.
 *
 * A serialized part pins it to 1 whatever the box says — the backend rejects
 * anything else, and the box is disabled in that state anyway.
 */
export function parseQuantity(values: ReceiveSkuValues, part: PartList | null): number | null {
  if (isQuantityLocked(part)) return 1;
  const raw = values.quantity.trim();
  if (!/^\d+$/.test(raw)) return null;
  const quantity = Number(raw);
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

export function validateReceiveSku(
  values: ReceiveSkuValues,
  part: PartList | null,
  photos: readonly StagedPhoto[],
  catalogError: string | null,
): ReceiveSkuErrors {
  const errors: ReceiveSkuErrors = {};

  if (values.manufacturerId === null) errors.manufacturer = 'Select a manufacturer';
  if (values.representativeId === null) errors.representative = 'Select who is accountable';
  if (!values.physicalLocation.trim()) errors.location = 'Select where it is stored';

  if (!values.catalogNumber.trim()) errors.catalogNumber = 'Enter the catalog number';
  else if (catalogError) errors.catalogNumber = catalogError;
  else if (!part) errors.catalogNumber = 'Look up the catalog number first';

  if (parseQuantity(values, part) === null) errors.quantity = 'Enter a quantity of 1 or more';

  if (values.udi.trim().length > MAX_UDI_LENGTH) {
    errors.udi = `UDI must be ${MAX_UDI_LENGTH} characters or fewer`;
  }
  if (values.lotCode.trim().length > MAX_LOT_CODE_LENGTH) {
    errors.lotCode = `Lot code must be ${MAX_LOT_CODE_LENGTH} characters or fewer`;
  }

  // Photos are optional here, unlike a kit: mobile requires one for a kit and
  // none for a SKU, and a loose component often has nothing worth photographing.
  if (photos.length > 10) errors.photos = 'You can attach up to 10 photos';

  return errors;
}

export function hasSkuErrors(errors: ReceiveSkuErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create body.
 *
 * Same endpoint as a kit — a stock item is a stock item — and the same
 * omissions: no `photo` (the generated client posts JSON and would drop it), no
 * `is_draft`.
 *
 * **No `is_complete`.** That is a kit's "are all its components present"
 * question and means nothing for a loose part; mobile's SKU payload omits it
 * too, and sending it would write a "Marked complete" history line about a
 * property this row does not have.
 *
 * `quantity` **is** sent here, unlike the kit form: a bulk part is stocked one
 * row per location and lot with a real count, and 1 is only the default.
 */
export function buildSkuCreateBody(
  values: ReceiveSkuValues,
  part: PartList,
): InventoryKitDetailRequest {
  const body: InventoryKitDetailRequest = {
    part: part.id,
    quantity: parseQuantity(values, part) ?? 1,
    assigned_to_representative: values.representativeId ?? undefined,
    physical_location: values.physicalLocation.trim(),
    ownership_type: values.ownershipType,
  };

  if (values.expirationDate) body.expiration_date = values.expirationDate;

  const udi = values.udi.trim();
  if (udi) body.udi = udi;

  const lotCode = values.lotCode.trim();
  if (lotCode) body.lot_code = lotCode;

  const notes = values.notes.trim();
  if (notes) body.notes = notes;

  return body;
}

/** Which form slot each field the server rejects belongs under. */
const FIELD_SLOTS: Record<string, keyof ReceiveSkuErrors> = {
  part: 'catalogNumber',
  kit: 'catalogNumber',
  quantity: 'quantity',
  assigned_to_representative: 'representative',
  physical_location: 'location',
  expiration_date: 'expirationDate',
  udi: 'udi',
  lot_code: 'lotCode',
  notes: 'notes',
  photo: 'photos',
};

export function skuFieldErrors(error: unknown): ReceiveSkuErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: ReceiveSkuErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}

/** The form-level alert: what the server said that no field could show. */
export function skuSaveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}
