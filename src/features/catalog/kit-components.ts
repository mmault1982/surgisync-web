/**
 * The Bill of Materials panel's logic, with no DOM in it.
 *
 * Sibling of `product.ts`, and the same split `directory/name.ts` and
 * `inventory/receive-sku.ts` make: validation and formatting live here so they
 * can be unit-tested without a render, and the dialogs stay about the dialog.
 */
import type { PartComponent } from '@/api/generated/model';

/**
 * The most of one part a kit may contain.
 *
 * Mirrors `MAX_QUANTITY` in `inventory/receive-sku.ts` rather than inventing a
 * second ceiling. The server's own limit is the `PositiveIntegerField` maximum
 * of 2147483647, which is not a rule so much as the absence of one — this is
 * the number a person could plausibly mean, and anything above it is a typo
 * worth catching before it is saved.
 */
export const MAX_COMPONENT_QUANTITY = 100_000;

/**
 * Why this quantity cannot be saved, or `undefined` if it can.
 *
 * A string, not a number, and that is deliberate — `receive-sku.ts` records the
 * reason: held as a number, an empty box is indistinguishable from zero.
 *
 * Digits only. `parseInt` would accept `'3kg'` and `Number` would accept
 * `'1e3'` and `' 3 '`, all of which round-trip to something the user did not
 * type. The one whitespace concession is trimming, because a paste often
 * carries it.
 */
export function validateQuantity(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a quantity.';
  if (!/^\d+$/.test(trimmed)) return 'Use whole numbers only.';

  const quantity = Number(trimmed);
  // A row for none of a part is not a fact about the kit — it is the row's
  // absence, spelled at greater length. The server refuses it too.
  if (quantity < 1) return 'Enter a quantity of 1 or more.';
  if (quantity > MAX_COMPONENT_QUANTITY) {
    return `Enter ${MAX_COMPONENT_QUANTITY.toLocaleString()} or fewer.`;
  }
  return undefined;
}

/**
 * The quantity as a number, or `null` when the field does not hold one.
 *
 * Guarded by `validateQuantity`, so the `null` is a programming error at the
 * call sites rather than a case they handle — they check first.
 */
export function parseQuantity(value: string): number | null {
  return validateQuantity(value) ? null : Number(value.trim());
}

/** Whether saving would send the value the row already has. */
export function isUnchangedQuantity(value: string, original: number): boolean {
  return parseQuantity(value) === original;
}

/**
 * What to call a component on screen.
 *
 * `description` first, then the catalog number. Every component in the catalog
 * carries a description, so the fallbacks are for a kit nested inside a kit —
 * structurally legal here, and the one row that can arrive with no reference
 * number. Deliberately not `catalogLabel` from `catalog.search.ts`: that one
 * takes a `PartList`, and a BOM row is its own flattened shape.
 */
export function componentLabel(row: PartComponent): string {
  return row.description.trim() || row.reference_number?.trim() || 'Unnamed component';
}
