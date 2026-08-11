/**
 * Which stock rows the user has selected, outside React.
 *
 * It lives in module scope for one reason: opening a kit unmounts the on-hand
 * route, and `useState` there would take the selection with it. Select seven
 * kits, click one to check its detail, and all seven are gone — with no undo,
 * because navigating back restores the filters but could not restore state that
 * no longer exists.
 *
 * Both sibling clients treat that as a bug rather than a trade-off. Mobile
 * keeps `selectedKitIds` on a controller that outlives the pushed detail route
 * ("The selection is intentionally kept — the user only edited one kit"), and
 * the prototype uses a module-scope Set that navigation never touches. This is
 * the same decision, in the shape `src/auth/auth-store.ts` already establishes
 * here: a store plus a thin `useSyncExternalStore` subscriber.
 *
 * Selection is keyed by id and deliberately independent of the current page, so
 * it survives paging and filtering too.
 */

let selected: ReadonlySet<number> = new Set();

const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** Replace the snapshot and notify. The only way `selected` is ever assigned. */
const commit = (next: ReadonlySet<number>) => {
  selected = next;
  emit();
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The current selection.
 *
 * Returns the *same reference* until something actually changes, which is not a
 * micro-optimisation but the `useSyncExternalStore` contract: it compares
 * snapshots by identity, so building a fresh Set here would re-render forever
 * ("The result of getSnapshot should be cached to avoid an infinite loop").
 * Every mutation below therefore constructs one new Set and commits it.
 */
export const getSelectedIds = (): ReadonlySet<number> => selected;

export function toggleSelected(id: number): void {
  const next = new Set(selected);
  // `delete` reports whether it removed anything, so this is one lookup.
  if (!next.delete(id)) next.add(id);
  commit(next);
}

/**
 * Select every visible row, or deselect exactly those when they are all already
 * selected.
 *
 * Takes the ids rather than reading them, which keeps the store ignorant of
 * paging and filtering — and means clearing a full page leaves selections made
 * on other pages alone. The prototype's select-all iterates every row it knows
 * about instead, so with a filter applied it silently selects rows the user
 * cannot see and never appears checked.
 */
export function toggleSelectedAll(visibleIds: readonly number[]): void {
  const next = new Set(selected);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));

  for (const id of visibleIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }

  commit(next);
}

/**
 * Drop everything.
 *
 * Called on sign-out. Module-scope state outlives the session, and without this
 * signing in as someone else leaves the header claiming "7 selected" against
 * ids from the previous organization — every checkbox unchecked, because none
 * of those ids appear in the new org's rows. Nothing leaks (ids are org-scoped
 * and the list simply will not contain them); it is just a count nobody can
 * explain or clear.
 */
export function clearSelection(): void {
  if (selected.size === 0) return;
  commit(new Set());
}
