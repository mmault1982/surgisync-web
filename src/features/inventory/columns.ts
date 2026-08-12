import { ApiV1StockItemsListOrdering as Ordering } from '@/api/generated/model';

import type { OnHandSearch } from './on-hand.search';

export type ColumnKey =
  | 'kit_id'
  | 'part_name'
  | 'manufacturer'
  | 'ownership_type'
  | 'status'
  | 'transit'
  | 'assigned'
  | 'physical_location'
  | 'expiration'
  | 'last_seen';

/**
 * The ascending half of the ordering enum.
 *
 * `Ordering` carries both directions — `part_name` and `-part_name` — so typing
 * the map below as `keyof typeof Ordering` would happily accept a descending
 * value, and the Desc lookup in `SortSection` would then resolve to `undefined`
 * at runtime with nothing failing at compile time. Excluding the `-` forms
 * makes that unrepresentable, and because the enum is symmetric it also lets
 * that lookup drop the cast that was hiding the hole.
 */
export type AscendingOrdering = Exclude<keyof typeof Ordering, `-${string}`>;

/** Which ordering values a column sorts by, if any. */
export const SORT_FIELD: Partial<Record<ColumnKey, AscendingOrdering>> = {
  kit_id: 'manufacturer_kit_id',
  part_name: 'part_name',
  manufacturer: 'manufacturer_name',
  ownership_type: 'ownership_type',
  status: 'is_complete',
  assigned: 'assigned_to_name',
  physical_location: 'physical_location',
  expiration: 'expiration_date',
  // `transit` and `last_seen` are absent on purpose: neither is sortable
  // server-side. Offering a control that silently does nothing is worse than
  // not offering it.
};

/** Which way this column is currently sorted, if it is the active sort at all. */
export function activeDirection(
  sortField: AscendingOrdering | undefined,
  search: OnHandSearch,
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
  search: OnHandSearch,
): 'ascending' | 'descending' | 'none' | undefined {
  const sortField = SORT_FIELD[columnKey];
  if (!sortField) return undefined;
  return activeDirection(sortField, search) ?? 'none';
}
