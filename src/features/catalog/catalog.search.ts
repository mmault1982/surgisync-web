import { z } from 'zod';

import { KindEnum, ListPartsOrdering as Ordering } from '@/api/generated/model';
import type { ListPartsParams, PartList } from '@/api/generated/model';

/**
 * The Product Catalog table's state, held in the URL.
 *
 * Same discipline as `on-hand.search.ts`, and for the same two reasons: a
 * filtered view is shareable and bookmarkable, and every field is
 * `.catch(...)`-guarded so a hand-edited or stale URL degrades to the default
 * rather than throwing a route error at someone who mistyped a page number.
 *
 * The enums come from the generated model, so removing a sort column or a kind
 * backend-side breaks `tsc` here rather than 400-ing in production.
 */

/**
 * Accept a single value where a list is expected.
 *
 * Lifted from `on-hand.search.ts`, which carries the full note. In short: the
 * router JSON-decodes search values, so a hand-written `?manufacturer_id=5`
 * arrives as the number 5 while the router's own navigation emits
 * `?manufacturer_id=[5]`. Accepting only the second form would have a typed
 * deep link silently drop its filter and show the unfiltered catalog — worse
 * than erroring, because it looks like it worked.
 */
const asList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).min(1),
  );

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_ORDERING = Ordering.name;

export const catalogSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(10)
    .max(200)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  ordering: z.enum(Ordering).catch(DEFAULT_ORDERING).default(DEFAULT_ORDERING),

  // The box above the table. Covers name, description, reference number and
  // manufacturer name server-side.
  search: z.string().min(1).optional().catch(undefined),

  // Manufacturer column: a multi-select checklist, OR-ed server-side.
  manufacturer_id: asList(z.coerce.number().int()).optional().catch(undefined),

  // Kind column. A **scalar**, not a list, because the endpoint takes one value
  // and the vocabulary has exactly two — so "either" is the same request as no
  // filter at all. The menu renders two boxes over this; see `catalog-column-menu`.
  kind: z.enum(KindEnum).optional().catch(undefined),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

/** Stripped from the URL when they match, to keep shared links short. */
export const CATALOG_DEFAULTS = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
  ordering: DEFAULT_ORDERING,
} as const;

/**
 * Search state -> API parameters.
 *
 * A pass-through, and deliberately so: the search param names were chosen to
 * match the API's, so the return type makes `tsc` catch any drift between what
 * the URL can express and what the endpoint accepts. A filter that no longer
 * exists server-side becomes a compile error rather than a parameter the
 * server ignores in silence.
 */
export function toListParams(search: CatalogSearch): ListPartsParams {
  return search;
}

/** Which columns carry a filter, for the active-filter chips and menus. */
export const FILTERABLE_COLUMNS = {
  manufacturer_id: 'Manufacturer',
  kind: 'Kind',
} as const satisfies Partial<Record<keyof CatalogSearch, string>>;

export type FilterKey = keyof typeof FILTERABLE_COLUMNS;

/** The filter keys currently set, for rendering chips. */
export function activeFilterKeys(search: CatalogSearch): FilterKey[] {
  return (Object.keys(FILTERABLE_COLUMNS) as FilterKey[]).filter(
    (key) => search[key] !== undefined,
  );
}

/** True when anything narrows the list, so the empty state can say which case it is. */
export function hasActiveFilters(search: CatalogSearch): boolean {
  return activeFilterKeys(search).length > 0 || search.search !== undefined;
}

/**
 * What to call a catalog row under a column headed "Name".
 *
 * Name first, then description — the **inverse** of `partLabel()` in
 * `receive-sku.ts`, and deliberately so rather than by oversight. That one
 * labels the result of a scanned catalog-number lookup, which only ever
 * resolves components, and every one of the catalog's components has a
 * description and none has a name; description-first is right there.
 *
 * This table shows both kinds. A kit has a real name and a column headed
 * "Name" should show it; a component has none and falls through to the
 * description it does have. Preferring description here would label a kit by
 * whatever prose happened to be attached to it — which is exactly what the
 * seeded demo data looks like ("Lapidus Fixation Set (seeded demo data)").
 *
 * The em dash is the last resort, matching the on-hand table's fallback for
 * any absent cell value.
 */
export function catalogLabel(part: PartList): string {
  return part.name?.trim() || part.description.trim() || part.reference_number?.trim() || '—';
}
