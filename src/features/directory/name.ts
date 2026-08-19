/**
 * The one field a directory record has, and the rules about it.
 *
 * DOM-free, so it can be tested without a render — the same split
 * `receive-sku.ts` makes. Both entities are exactly one writable field, so
 * there is one copy of this rather than one per entity.
 */

/** Mirrors the contract's `maxLength` on both entities' `name`. */
export const MAX_NAME_LENGTH = 100;

/**
 * The client-side rule, and only that.
 *
 * Uniqueness is deliberately absent: it is case-insensitive and scoped to the
 * caller's organization, so only the server can know it. Its 400 comes back
 * keyed on `name` and lands in the same slot this fills.
 */
export function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter a name.';
  if (name.length > MAX_NAME_LENGTH) return `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  return undefined;
}

/** True when saving would change nothing, so the dialog can close without a request. */
export function isUnchanged(value: string, original: string): boolean {
  return value.trim() === original;
}
