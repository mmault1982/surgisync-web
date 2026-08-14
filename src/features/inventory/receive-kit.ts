import { asConflict, asFieldErrors, errorMessage } from '@/api/errors';
import type { InventoryKitDetailRequest, OwnershipTypeEnum } from '@/api/generated/model';

import { trackerErrorMessage } from './add-tracker';

/**
 * Everything the Receive / Load form decides, with no DOM in sight.
 *
 * Same split as `update-status.ts`: the validation rules, the payload shape and
 * the error mapping are the parts worth testing and none of them need a render.
 * The network half — a create followed by N photo uploads, with a latch — lives
 * in `receive-kit.save.ts`.
 */

/** The four physical locations mobile always offers, before any facets. */
export const DEFAULT_LOCATIONS = ['Warehouse', 'Vehicle', 'Home', 'Storage Unit'] as const;

export const OWNERSHIP_TYPES: { value: OwnershipTypeEnum; label: string }[] = [
  { value: 'owned', label: 'Owned' },
  { value: 'consigned', label: 'Consigned' },
  { value: 'loaned', label: 'Loaned' },
];

/** `manufacturer_kit_id` is `maxLength: 64` on the contract. */
export const MAX_KIT_ID_LENGTH = 64;

export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 10;

/** One picked file plus the object URL its tile renders from. */
export interface StagedPhoto {
  key: string;
  file: File;
  previewUrl: string;
}

/**
 * What the form holds.
 *
 * Ids are numbers-or-null rather than strings: `Select` deals in strings, so the
 * component converts at its own boundary and everything below here works in the
 * types the payload actually needs.
 */
export interface ReceiveKitValues {
  manufacturerId: number | null;
  representativeId: number | null;
  physicalLocation: string;
  partId: number | null;
  kitId: string;
  beaconId: string;
  ownershipType: OwnershipTypeEnum;
  isComplete: boolean;
  notes: string;
}

export function initialValues(): ReceiveKitValues {
  return {
    manufacturerId: null,
    representativeId: null,
    physicalLocation: '',
    partId: null,
    kitId: '',
    beaconId: '',
    // Consigned in both the prototype and mobile — most stock a rep carries is
    // the manufacturer's, not the practice's.
    ownershipType: 'consigned',
    isComplete: true,
    notes: '',
  };
}

/** One message per form slot. Absent means the slot is fine. */
export interface ReceiveKitErrors {
  manufacturer?: string;
  representative?: string;
  location?: string;
  part?: string;
  kitId?: string;
  beacon?: string;
  photos?: string;
  notes?: string;
}

export function validateReceiveKit(
  values: ReceiveKitValues,
  photos: readonly StagedPhoto[],
): ReceiveKitErrors {
  const errors: ReceiveKitErrors = {};

  if (values.manufacturerId === null) errors.manufacturer = 'Select a manufacturer';
  if (values.representativeId === null) errors.representative = 'Select who is accountable';
  if (!values.physicalLocation.trim()) errors.location = 'Select where it is stored';
  if (values.partId === null) errors.part = 'Select a kit';

  // Trimmed, because the server would accept "   " into a CharField and the kit
  // would come back with an id nobody can scan or search for.
  const kitId = values.kitId.trim();
  if (!kitId) errors.kitId = 'Enter the kit ID';
  else if (kitId.length > MAX_KIT_ID_LENGTH) {
    errors.kitId = `Kit ID must be ${MAX_KIT_ID_LENGTH} characters or fewer`;
  }

  if (photos.length < MIN_PHOTOS) errors.photos = 'A kit must have at least one photo';
  else if (photos.length > MAX_PHOTOS) errors.photos = `You can attach up to ${MAX_PHOTOS} photos`;

  return errors;
}

export function hasErrors(errors: ReceiveKitErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * The create body.
 *
 * Deliberately narrow — every field here is one the user set.
 *
 * **No `photo`.** `create_inventory_kit` declares `application/json` first among
 * its request content types, so the generated client posts JSON and a `File` in
 * the body would be dropped silently. Photos go through the photos
 * sub-resource, which is multipart-first; the server mirrors the first one onto
 * the kit's `photo` column either way.
 *
 * **No `quantity`.** It defaults to 1, kits are serialized parts, and the
 * serializer rejects anything but 1 for one — so the only values this form
 * could send are the default or a 400.
 *
 * **No `is_draft`.** Mobile sends `false` explicitly; that is the model default.
 *
 * **`part`, never `kit`.** `kit` is the deprecated alias of the same column;
 * sending both with different values is rejected outright.
 */
export function buildCreateBody(values: ReceiveKitValues): InventoryKitDetailRequest {
  const body: InventoryKitDetailRequest = {
    part: values.partId ?? undefined,
    manufacturer_kit_id: values.kitId.trim(),
    assigned_to_representative: values.representativeId ?? undefined,
    physical_location: values.physicalLocation.trim(),
    ownership_type: values.ownershipType,
    // The only status flag sent. The other five default correctly on the model,
    // and setting them explicitly would write six "Marked …" history lines for
    // a kit that has only just come into existence.
    is_complete: values.isComplete,
  };

  const notes = values.notes.trim();
  if (notes) body.notes = notes;

  // Omitted rather than sent blank. `attach_beacon` strips and ignores an empty
  // value, so `""` is harmless — but omitting says what is meant.
  const beaconId = values.beaconId.trim();
  if (beaconId) body.beacon_id = beaconId;

  return body;
}

/** Which form slot each field the server rejects belongs under. */
const FIELD_SLOTS: Record<string, keyof ReceiveKitErrors> = {
  part: 'part',
  kit: 'part',
  manufacturer_kit_id: 'kitId',
  assigned_to_representative: 'representative',
  physical_location: 'location',
  notes: 'notes',
  beacon_id: 'beacon',
  photo: 'photos',
};

/**
 * A 400's field map, folded onto this form's slots.
 *
 * Fields with no slot are dropped here and surfaced by `saveErrorMessage`
 * instead, so nothing the server said goes unshown. One such case is real and
 * reachable rather than theoretical: a user whose account is in no organization
 * gets `{parent_company: [...]}` from `perform_create`, and this form has no
 * field for it to land under.
 */
export function receiveFieldErrors(error: unknown): ReceiveKitErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: ReceiveKitErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}

/**
 * The message for the form-level alert: whatever the server said that no field
 * could show, else the house generic copy.
 */
export function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}

/**
 * The beacon conflict, or null when this failure is not one.
 *
 * Reuses `trackerErrorMessage` rather than restating the copy: the Add Tracker
 * dialog maps the same two 409 codes, and `create_inventory_kit` documents them
 * on its own 409 because the create attaches the beacon in the same
 * transaction.
 */
export function beaconConflictMessage(error: unknown): string | null {
  return asConflict(error) ? trackerErrorMessage(error) : null;
}

/**
 * The Physical Location options: the values this org already uses, plus the
 * four mobile always offers.
 *
 * The union matters for a brand-new organization, whose facets are empty — a
 * required select with no options is unfillable, and the screen would be a dead
 * end on the very first kit anyone tried to receive.
 */
export function locationOptions(facets: readonly string[] | undefined): string[] {
  const merged = new Set<string>(facets ?? []);
  for (const name of DEFAULT_LOCATIONS) merged.add(name);
  return [...merged].sort((a, b) => a.localeCompare(b));
}
