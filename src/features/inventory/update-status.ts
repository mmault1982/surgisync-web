import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleQuestionMarkIcon,
  FileTextIcon,
  PackageIcon,
  PackageOpenIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';

import { asFieldErrors, errorMessage } from '@/api/errors';
import type { InventoryKitDetail, PatchedInventoryKitDetailRequest } from '@/api/generated/model';

/**
 * Everything the Update Status dialog decides, with no DOM in sight.
 *
 * Kept out of the component for the usual reason — the chip algebra, the photo
 * staging and the payload shape are the parts worth testing, and none of them
 * need a render. The network half lives in `update-status.save.ts`.
 */

// ── Status flags ────────────────────────────────────────────────────────────

/**
 * The five booleans the chips write.
 *
 * `is_returned` is deliberately absent. It has no chip, so there is no user
 * intent to hold — and with no variable for it, "echo the kit's value, never
 * send a hardcoded one" is structural rather than a comment somebody has to
 * remember. `buildStatusPatch` reads it straight off the kit.
 */
export interface StatusFlags {
  is_complete: boolean;
  is_wrapped: boolean;
  is_signed_in: boolean;
  is_lost: boolean;
  is_other: boolean;
}

export interface Chip {
  key: string;
  label: string;
  /** Which of the five booleans this chip is a face of. */
  flag: keyof StatusFlags;
  /** The value this face represents: Incomplete is `is_complete === false`. */
  value: boolean;
  /** Lost and Other have no opposite face, so clicking one again clears it. */
  independent?: boolean;
  icon: LucideIcon;
  iconClassName?: string;
}

/**
 * The eight chips, row-major across a four-column grid.
 *
 * Eight faces onto five booleans: Complete/Incomplete are the two poles of
 * `is_complete`, and likewise Wrapped/Unwrapped and Signed In/Signed Out. There
 * is no `is_incomplete` field to write.
 */
export const STATUS_CHIPS: readonly Chip[] = [
  { key: 'complete', label: 'Complete', flag: 'is_complete', value: true, icon: CheckIcon },
  { key: 'wrapped', label: 'Wrapped', flag: 'is_wrapped', value: true, icon: PackageIcon },
  { key: 'signed-in', label: 'Signed In', flag: 'is_signed_in', value: true, icon: ArrowRightIcon },
  {
    key: 'lost',
    label: 'Lost',
    flag: 'is_lost',
    value: true,
    independent: true,
    icon: CircleQuestionMarkIcon,
  },
  {
    key: 'incomplete',
    label: 'Incomplete',
    flag: 'is_complete',
    value: false,
    icon: TriangleAlertIcon,
    iconClassName: 'text-warning',
  },
  { key: 'unwrapped', label: 'Unwrapped', flag: 'is_wrapped', value: false, icon: PackageOpenIcon },
  {
    key: 'signed-out',
    label: 'Signed Out',
    flag: 'is_signed_in',
    value: false,
    icon: ArrowLeftIcon,
  },
  {
    key: 'other',
    label: 'Other',
    flag: 'is_other',
    value: true,
    independent: true,
    icon: FileTextIcon,
  },
];

/** What each chip means, from the mobile app. Exactly these five. */
export const STATUS_LEGEND: readonly string[] = [
  'Complete - All items present and accounted for',
  'Wrapped - Sterile-wrapped and ready',
  'Signed In - Signed-in to SPD',
  'Lost - Cannot be located',
  'Other - See notes',
];

export function seedFlags(kit: InventoryKitDetail): StatusFlags {
  // The detail serializer declares all six as optional. An omitted flag means
  // false, the same reading `stock-status.ts` takes.
  return {
    is_complete: kit.is_complete ?? false,
    is_wrapped: kit.is_wrapped ?? false,
    is_signed_in: kit.is_signed_in ?? false,
    is_lost: kit.is_lost ?? false,
    is_other: kit.is_other ?? false,
  };
}

export function isChipSelected(chip: Chip, flags: StatusFlags): boolean {
  return flags[chip.flag] === chip.value;
}

/**
 * Clicking a chip.
 *
 * A pole click is an assignment, so it is idempotent: clicking a lit Complete
 * leaves it lit, and exactly one of each pair is always selected. An
 * independent chip flips. Nothing here can clear another flag — the prototype's
 * "Lost clears all" rule was explicitly rejected for this product, and the way
 * to keep it out is to leave it unrepresentable.
 */
export function toggleChip(flags: StatusFlags, chip: Chip): StatusFlags {
  return chip.independent
    ? { ...flags, [chip.flag]: !flags[chip.flag] }
    : { ...flags, [chip.flag]: chip.value };
}

// ── Photo staging ───────────────────────────────────────────────────────────

export interface ExistingPhoto {
  kind: 'existing';
  key: string;
  photoId: number;
  url: string | null;
}

export interface StagedPhoto {
  kind: 'staged';
  key: string;
  file: File;
  previewUrl: string;
}

export type PhotoTile = ExistingPhoto | StagedPhoto;

export interface PhotoStrip {
  /** Display order — and, by construction, the post-save server order. */
  tiles: readonly PhotoTile[];
  /** Server photo ids the user removed; deleted at save time, not before. */
  removed: readonly number[];
  /** Behind staged keys, so a removed-then-re-added file gets a fresh one. */
  nextKey: number;
}

export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 10;

export function seedStrip(kit: InventoryKitDetail): PhotoStrip {
  return {
    // The server orders photos oldest first and treats the oldest as primary,
    // so this order is also the "Primary" badge's meaning.
    tiles: kit.photos.map((photo) => ({
      kind: 'existing',
      key: `photo:${photo.id}`,
      photoId: photo.id,
      url: photo.url,
    })),
    removed: [],
    nextKey: 1,
  };
}

export function addFiles(
  strip: PhotoStrip,
  files: readonly { file: File; previewUrl: string }[],
): PhotoStrip {
  let nextKey = strip.nextKey;
  const added: StagedPhoto[] = files.map(({ file, previewUrl }) => ({
    kind: 'staged',
    key: `file:${nextKey++}`,
    file,
    previewUrl,
  }));
  return { ...strip, tiles: [...strip.tiles, ...added], nextKey };
}

/**
 * Drop a tile.
 *
 * Returns the object URL that just became unreachable rather than revoking it
 * here, so this module never touches the DOM and the decision stays testable.
 * A server photo yields no URL — it yields a deletion to run at save time.
 */
export function removeTile(
  strip: PhotoStrip,
  key: string,
): { next: PhotoStrip; revoke: string | null } {
  const tile = strip.tiles.find((candidate) => candidate.key === key);
  if (!tile) return { next: strip, revoke: null };

  const tiles = strip.tiles.filter((candidate) => candidate.key !== key);
  return tile.kind === 'existing'
    ? { next: { ...strip, tiles, removed: [...strip.removed, tile.photoId] }, revoke: null }
    : { next: { ...strip, tiles }, revoke: tile.previewUrl };
}

export function photoCount(strip: PhotoStrip): number {
  return strip.tiles.length;
}

export function stagedUrls(strip: PhotoStrip): string[] {
  return strip.tiles.filter((tile) => tile.kind === 'staged').map((tile) => tile.previewUrl);
}

// ── Payload and photo ops ───────────────────────────────────────────────────

export type PhotoOp =
  { kind: 'upload'; id: string; file: File } | { kind: 'delete'; id: string; photoId: number };

/**
 * The photo work a save has to do, in the order it has to do it.
 *
 * Uploads before deletions so the kit's photo count only ever rises during the
 * first half; the ids match tile keys, so a failed upload can mark its own
 * tile. The resulting server order is `[surviving existing…, additions…]`,
 * which is exactly the strip's own order — that is what makes a positional
 * "Primary" badge on tile 0 honest rather than a guess.
 */
export function planPhotoOps(strip: PhotoStrip): PhotoOp[] {
  const uploads: PhotoOp[] = strip.tiles
    .filter((tile) => tile.kind === 'staged')
    .map((tile) => ({ kind: 'upload', id: tile.key, file: tile.file }));
  const deletions: PhotoOp[] = strip.removed.map((photoId) => ({
    kind: 'delete',
    id: `photo:${photoId}`,
    photoId,
  }));
  return [...uploads, ...deletions];
}

export interface StatusFormValues {
  flags: StatusFlags;
  location: string;
  notes: string;
}

export function buildStatusPatch(
  kit: InventoryKitDetail,
  values: StatusFormValues,
): PatchedInventoryKitDetailRequest {
  return {
    ...values.flags,
    // Echoed, not defaulted — and omitted when the kit did not report it, which
    // PATCH reads as "leave it alone". Sending `false` here would quietly clear
    // a returned kit's flag. The five above are different: the chips force an
    // explicit choice for each, so there is always a value to send.
    ...(kit.is_returned === undefined ? {} : { is_returned: kit.is_returned }),
    physical_location: values.location,
    // Explicit null clears the field. Mobile omits an empty value and therefore
    // cannot clear notes at all; that is a bug there, not a contract.
    notes: values.notes.trim() || null,
    // `photo` is never written. It replaces the primary photo's image in place,
    // which is not what any control in this dialog offers to do.
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface StatusFormErrors {
  status?: string;
  location?: string;
  notes?: string;
  photos?: string;
}

/**
 * The client-side rules. The server enforces none of them.
 *
 * These validate rather than prevent: the strip is allowed to hold 0 or 11
 * tiles and the Select is allowed to sit empty. Blocking the eleventh add would
 * state the maximum in two places and leave its message unreachable.
 */
export function validateStatusForm(values: StatusFormValues, strip: PhotoStrip): StatusFormErrors {
  const errors: StatusFormErrors = {};

  if (!values.location.trim()) errors.location = 'Select a physical location';

  if ((values.flags.is_lost || values.flags.is_other) && !values.notes.trim()) {
    errors.notes = 'Notes are required when Lost or Other is selected';
  }

  const count = photoCount(strip);
  if (count < MIN_PHOTOS) errors.photos = 'A kit must have at least one photo';
  else if (count > MAX_PHOTOS) errors.photos = `You can attach up to ${MAX_PHOTOS} photos`;

  return errors;
}

export function hasFormErrors(errors: StatusFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Which form slot each field the server rejected belongs under. */
const FIELD_SLOTS: Record<string, keyof StatusFormErrors> = {
  is_complete: 'status',
  is_wrapped: 'status',
  is_signed_in: 'status',
  is_returned: 'status',
  is_lost: 'status',
  is_other: 'status',
  physical_location: 'location',
  notes: 'notes',
  photo: 'photos',
  photos: 'photos',
};

/**
 * The server's 400 mapped onto the same four slots the client rules use.
 *
 * Fields with no slot (and `non_field_errors`) are dropped here on purpose —
 * `saveErrorMessage` surfaces them in the form-level alert instead, so nothing
 * the server said goes unshown.
 */
export function statusFieldErrors(error: unknown): StatusFormErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: StatusFormErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    if (!slot || messages.length === 0) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${messages[0]}` : messages[0];
  }
  return errors;
}

/** The form-level alert: what the server said, else the house generic copy. */
export function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}

/**
 * The Physical Location options.
 *
 * Facets are the org's distinct values in use, so they normally contain the
 * kit's own location — but a kit whose location has since been retired would
 * otherwise watch its value vanish from a required field on open.
 */
export function withCurrentLocation(
  results: readonly string[],
  current: string | null | undefined,
): string[] {
  const options = [...results];
  const trimmed = current?.trim();
  if (trimmed && !options.includes(trimmed)) options.push(trimmed);
  return options;
}
