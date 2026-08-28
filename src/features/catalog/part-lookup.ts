/**
 * Finding a catalog part by the number printed on it.
 *
 * Lifted out of `features/inventory/receive-sku.ts` when the Bill of Materials
 * panel's Add dialog became the second caller — the same move `field.tsx`,
 * `delete-dialog.tsx` and `auth/permissions.ts` each record making, and for the
 * same reason. Nothing here was ever about receiving stock: it is about the
 * catalog, which is what this feature is.
 *
 * Both callers ask the same question in the same words — the user types a
 * catalog number and it either resolves to one part of an expected
 * manufacturer or says why it does not — so the wrong-manufacturer branch below
 * has one implementation rather than two that drift.
 */
import { listParts } from '@/api/generated/endpoints/inventory/inventory';
import type { PartList } from '@/api/generated/model';

/**
 * Resolve a typed catalog number to the parts that carry it.
 *
 * A function rather than a `queryOptions`, because this is a lookup the user
 * triggers by finishing the field, not a list a screen keeps in view — there is
 * nothing to cache against and nothing to re-render when it changes.
 *
 * **Deliberately unscoped by manufacturer.** `reference_number` is unique per
 * manufacturer rather than across the catalog, so this can return more than one
 * row — and asking the server to narrow it would collapse "this number belongs
 * to a different manufacturer" into a bare "no such part", which is the one
 * distinction the user needs. `resolveCatalogNumber` picks from what comes
 * back.
 *
 * Not scoped by `kind` either: kits carry no reference number at all, so the
 * filter already excludes them.
 */
export function lookupByReference(referenceNumber: string, signal?: AbortSignal) {
  return listParts({ reference_number: referenceNumber }, { signal });
}

/**
 * What a resolved catalog number produced.
 *
 * `part` and `error` are mutually exclusive, and both may be absent — that is
 * the state before anything has been looked up.
 */
export interface CatalogResolution {
  part: PartList | null;
  error: string | null;
}

/**
 * Pick the part a typed catalog number meant, or say why none of them fits.
 *
 * The lookup is deliberately not scoped to the chosen manufacturer, because
 * `reference_number` is unique per manufacturer rather than across the catalog.
 * That makes the wrong-manufacturer case *reachable and nameable* instead of
 * indistinguishable from a typo, which matters more than it sounds: the server
 * derives a stock item's manufacturer from its part, so saving a mismatch would
 * file the stock under a manufacturer nobody picked and **nothing would reject
 * it**. Hence blocking, not a warning — mobile's `catalogManufacturerMismatch`
 * reaches the same conclusion.
 */
export function resolveCatalogNumber(
  results: readonly PartList[],
  manufacturerId: number | null,
): CatalogResolution {
  if (results.length === 0) return { part: null, error: 'No catalog item has that number' };

  const match = results.find((part) => part.manufacturer === manufacturerId);
  if (match) return { part: match, error: null };

  // No manufacturer chosen yet: hold the item rather than accusing the user of
  // a mismatch they have not had the chance to make. Submit re-checks.
  if (manufacturerId === null) return { part: results[0] ?? null, error: null };

  const name = results[0]?.manufacturer_name;
  return {
    part: null,
    error: name ? `This item belongs to ${name}` : 'This item belongs to a different manufacturer',
  };
}

/**
 * What to call a resolved part on screen.
 *
 * `description` first, and that order is the whole point: kits carry a name and
 * no description, components carry a description and no name. Every one of the
 * catalog's components has a description and none has a name, so a Description
 * field reading `name` is blank for every part this form can find. Mobile's
 * `skuDescription` prefers the same one.
 */
export function partLabel(part: PartList): string {
  const description = part.description.trim();
  if (description) return description;
  return part.name?.trim() || part.reference_number || 'Unnamed catalog item';
}
