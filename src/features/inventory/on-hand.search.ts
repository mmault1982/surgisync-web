import { z } from 'zod';

import {
  ApiV1StockItemsListOrdering as Ordering,
  ApiV1StockItemsListOwnershipTypeItem as OwnershipType,
  ApiV1StockItemsListStatusItem as StatusLabel,
} from '@/api/generated/model';
import type { ApiV1StockItemsListParams } from '@/api/generated/model';

/**
 * The table's state, held in the URL.
 *
 * Every filter and the sort live here so a view is shareable and bookmarkable —
 * the FRD needs deep links into pre-filtered lists, and an alert that cannot
 * link to the rows it is about is not much of an alert.
 *
 * Every field uses `.catch(...)`: a hand-edited or stale URL degrades to the
 * default rather than throwing a route error at someone who only wanted to look
 * at their inventory.
 *
 * The enums come from the generated model, so removing a sort column or a
 * status label backend-side breaks `tsc` here rather than 400-ing in
 * production.
 */

/**
 * Accept a single value where a list is expected.
 *
 * The router JSON-decodes search values, so a hand-written `?status=lost`
 * arrives as the string "lost" while its own navigation emits
 * `?status=["lost"]`. Only accepting the second form would mean a deep link
 * someone types — or that an alert or dashboard bucket builds — silently
 * dropping its filter and showing the unfiltered table, which is worse than
 * erroring because it looks like it worked.
 */
const asList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).min(1),
  );

const idList = asList(z.coerce.number().int()).optional().catch(undefined);
const textList = asList(z.string().min(1)).optional().catch(undefined);
const tristate = z.coerce.boolean().optional().catch(undefined);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_ORDERING = Ordering['-created_at'];

export const onHandSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(10)
    .max(200)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  ordering: z.enum(Ordering).catch(DEFAULT_ORDERING).default(DEFAULT_ORDERING),

  // Free-text box above the table. Covers kit name, manufacturer,
  // manufacturer_kit_id, udi and physical_location server-side.
  search: z.string().min(1).optional().catch(undefined),

  // Multi-select column menus.
  manufacturer_id: idList,
  assigned_to_facility: idList,
  assigned_to_representative: idList,
  physical_location: textList,
  ownership_type: asList(z.enum(OwnershipType)).optional().catch(undefined),
  status: asList(z.enum(StatusLabel)).optional().catch(undefined),

  // Kit ID column: a type-to-filter box, not a checklist.
  manufacturer_kit_id_contains: z.string().min(1).optional().catch(undefined),

  // Expiration column presets.
  expiration_date_after: isoDate,
  expiration_date_before: isoDate,
  has_expiration_date: tristate,

  // Transit column.
  in_transit: tristate,
});

export type OnHandSearch = z.infer<typeof onHandSearchSchema>;

/** Stripped from the URL when they match, to keep shared links short. */
export const ON_HAND_DEFAULTS = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
  ordering: DEFAULT_ORDERING,
} as const;

/**
 * Search state -> API parameters.
 *
 * Currently a pass-through, and deliberately so: the names were chosen to match
 * the API, so `tsc` catches any drift between what the URL can express and what
 * the endpoint accepts. If this ever needs real mapping, it belongs here rather
 * than scattered through components.
 */
export function toListParams(search: OnHandSearch): ApiV1StockItemsListParams {
  return search;
}

/** Which columns carry a filter, for the active-filter chips and menus. */
export const FILTERABLE_COLUMNS = {
  manufacturer_kit_id_contains: 'Kit ID',
  manufacturer_id: 'Manufacturer',
  ownership_type: 'Type',
  status: 'Status',
  in_transit: 'Transit',
  assigned_to_representative: 'Rep / Assigned To',
  assigned_to_facility: 'Facility',
  physical_location: 'Physical Location',
  expiration_date_before: 'Expiration',
  expiration_date_after: 'Expiration',
  has_expiration_date: 'Expiration',
} as const satisfies Partial<Record<keyof OnHandSearch, string>>;

export type FilterKey = keyof typeof FILTERABLE_COLUMNS;

/** The filter keys currently set, for rendering chips. */
export function activeFilterKeys(search: OnHandSearch): FilterKey[] {
  return (Object.keys(FILTERABLE_COLUMNS) as FilterKey[]).filter(
    (key) => search[key] !== undefined,
  );
}

export function hasActiveFilters(search: OnHandSearch): boolean {
  return activeFilterKeys(search).length > 0 || search.search !== undefined;
}
