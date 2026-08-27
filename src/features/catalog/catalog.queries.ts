import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import {
  listManufacturers,
  listPartManufacturerFacets,
  listParts,
  retrievePart,
} from '@/api/generated/endpoints/inventory/inventory';

import { partFormKeys, productCatalogKeys } from './catalog.keys';
import { toListParams, type CatalogSearch } from './catalog.search';

export function catalogListQuery(search: CatalogSearch) {
  return queryOptions({
    queryKey: productCatalogKeys.list(search),
    queryFn: ({ signal }) => listParts(toListParams(search), undefined, signal),
    // Keeps the current page on screen while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

/**
 * One catalog part, for the detail screen and the edit form.
 *
 * No `placeholderData`: unlike the list, there is no previous value worth
 * keeping on screen — a different id is a different part, and showing the
 * last one while this one loads would be showing the wrong record.
 */
export function productDetailQuery(id: number) {
  return queryOptions({
    queryKey: productCatalogKeys.detail(id),
    queryFn: ({ signal }) => retrievePart(id, undefined, signal),
  });
}

/**
 * The catalog's own facet menus.
 *
 * Cached for the session: the set of manufacturers with catalog parts changes
 * on a human clock, far slower than the filtering and paging built on top of
 * it, and a checklist that refetched on every open would flicker.
 */
const FACET_STALE_TIME = 5 * 60 * 1000;

export const catalogFacetQueries = {
  /**
   * Manufacturers to filter the catalog *by*.
   *
   * `/api/v1/parts/manufacturers/`, not `list_manufacturers({has_items: true})`
   * — the two answer different questions and only this one agrees with the
   * table. `/manufacturers/` is the global list and `has_items` narrows it
   * only to manufacturers with a catalog *somewhere*, while `/parts/` is
   * org-scoped: on the dev seed 7 of its 12 values are dead ends for a given
   * org, so over half the checklist would be options that can only ever return
   * an empty table. This endpoint is derived from the same queryset as the
   * listing, so every value it offers returns at least one row.
   *
   * Nor `facetQueries.manufacturers()` from the on-hand screen, which answers
   * "whose stock do you already hold" — a strict subset, and the wrong one for
   * a screen about what you could choose.
   */
  manufacturers: () =>
    queryOptions({
      queryKey: productCatalogKeys.facet('manufacturers'),
      queryFn: ({ signal }) => listPartManufacturerFacets(undefined, signal),
      staleTime: FACET_STALE_TIME,
    }),
};

/**
 * Manufacturers the product form may file a part under.
 *
 * **Not** `catalogFacetQueries.manufacturers()` above, and not
 * `catalogQueries.manufacturers()` in the Receive form either — three lists,
 * three different questions:
 *
 * - the facet endpoint answers "whose parts are in my catalog", which is right
 *   for the table's filter menu and wrong here, since it cannot offer a
 *   manufacturer that has no parts yet — the exact case of adding the first
 *   one.
 * - the Receive form passes `has_items: true`, which excludes the same set for
 *   the same reason.
 * - this one omits the filter, so every manufacturer the organization owns is
 *   selectable.
 *
 * `/api/v1/manufacturers/` is org-scoped server-side, so no extra narrowing is
 * needed here. One page holds the lot — the endpoint's page is 500 — so
 * nothing pages.
 */
export function partFormManufacturersQuery() {
  return queryOptions({
    queryKey: partFormKeys.manufacturers(),
    queryFn: ({ signal }) => listManufacturers(undefined, { signal }),
    staleTime: FACET_STALE_TIME,
    // The response also carries a deprecated `data` duplicating `results`,
    // alive only until the shipped Flutter build that reads it is replaced.
    // Selecting here keeps that fact in the two lines that get deleted with it.
    select: (page) => page.results,
  });
}
