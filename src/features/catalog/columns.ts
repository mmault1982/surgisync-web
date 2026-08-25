import { ListPartsOrdering as Ordering } from '@/api/generated/model';

import type { CatalogSearch } from './catalog.search';

export type ColumnKey = 'name' | 'manufacturer' | 'reference_number' | 'kind';

/**
 * The ascending half of the ordering enum.
 *
 * `Ordering` carries both directions — `name` and `-name` — so typing the map
 * below as `keyof typeof Ordering` would happily accept a descending value, and
 * the Desc lookup in `SortSection` would then resolve to `undefined` at runtime
 * with nothing failing at compile time. Excluding the `-` forms makes that
 * unrepresentable, and because the enum is symmetric it also lets that lookup
 * drop a cast. Same reasoning as the on-hand screen's `columns.ts`.
 */
export type AscendingOrdering = Exclude<keyof typeof Ordering, `-${string}`>;

/** Which ordering values a column sorts by, if any. */
export const SORT_FIELD: Partial<Record<ColumnKey, AscendingOrdering>> = {
  name: 'name',
  manufacturer: 'manufacturer_name',
  reference_number: 'reference_number',
  // `kind` is absent on purpose. It is a two-valued enum, so sorting it is a
  // filter wearing a hat — and the column already offers that filter. The
  // backend declines to sort on it for the same reason.
};

/** Which way this column is currently sorted, if it is the active sort at all. */
export function activeDirection(
  sortField: AscendingOrdering | undefined,
  search: CatalogSearch,
): 'ascending' | 'descending' | undefined {
  if (!sortField) return undefined;
  if (search.ordering === sortField) return 'ascending';
  if (search.ordering === `-${sortField}`) return 'descending';
  return undefined;
}

/**
 * The sort direction for a `<th aria-sort>`, or `undefined` where the column
 * does not sort at all and the attribute should simply be absent.
 *
 * Lives beside `SORT_FIELD` rather than in the table, which renders the header
 * cell but has no business knowing which ordering values back which column.
 */
export function columnAriaSort(
  columnKey: ColumnKey,
  search: CatalogSearch,
): 'ascending' | 'descending' | 'none' | undefined {
  const sortField = SORT_FIELD[columnKey];
  if (!sortField) return undefined;
  return activeDirection(sortField, search) ?? 'none';
}
