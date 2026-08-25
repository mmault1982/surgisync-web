import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import {
  listPartManufacturerFacets,
  listParts,
} from '@/api/generated/endpoints/inventory/inventory';

import { productCatalogKeys } from './catalog.keys';
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
