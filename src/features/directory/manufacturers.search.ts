import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The Manufacturers table's state, in the URL.
 *
 * Cut down from `on-hand.search.ts`: this screen has no column filters and no
 * sort, because the server returns one order (by name) and the list is small
 * enough that the search box is the whole filtering story.
 *
 * Every field is `.catch(...)`-guarded for the same reason as on-hand — a
 * hand-edited or stale URL should degrade to the default rather than throw a
 * route error at someone who only mistyped a page number.
 */
export const manufacturerSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(10)
    .max(200)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().min(1).optional().catch(undefined),
});

export type ManufacturerSearch = z.infer<typeof manufacturerSearchSchema>;

export const MANUFACTURER_DEFAULTS: ManufacturerSearch = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

/** True when anything narrows the list, so the empty state can say which case it is. */
export function hasActiveSearch(search: ManufacturerSearch): boolean {
  return Boolean(search.search);
}

/**
 * A deliberate pass-through: the search param names were chosen to match the
 * API's, so `tsc` catches any drift rather than a filter silently doing
 * nothing. Same reasoning as `toListParams` on the on-hand screen.
 */
export function toListParams(search: ManufacturerSearch) {
  return {
    page: search.page,
    page_size: search.page_size,
    search: search.search,
  };
}
