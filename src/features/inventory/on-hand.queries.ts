import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import {
  apiV1StockItemsList,
  listInventoryKitManufacturerKitIds,
  listStockItemFacilityFacets,
  listStockItemManufacturerFacets,
  listStockItemPhysicalLocationFacets,
} from '@/api/generated/endpoints/inventory/inventory';

import { toListParams, type OnHandSearch } from './on-hand.search';

/**
 * The only place stock-item query keys are constructed.
 *
 * Keeping them here means a filter change cannot accidentally reuse another
 * screen's cache entry, and there is one place to look when a refetch does not
 * happen.
 */
export const stockItemKeys = {
  all: ['stock-items'] as const,
  list: (search: OnHandSearch) => [...stockItemKeys.all, 'list', search] as const,
  facets: () => [...stockItemKeys.all, 'facets'] as const,
  facet: (name: string) => [...stockItemKeys.facets(), name] as const,
};

export function onHandListQuery(search: OnHandSearch) {
  return queryOptions({
    queryKey: stockItemKeys.list(search),
    queryFn: ({ signal }) => apiV1StockItemsList(toListParams(search), { signal }),
    // Keeps the previous page visible while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

/**
 * Options for the column filter menus.
 *
 * These come from facet endpoints scoped to the requesting organization, not
 * from the global catalog: a menu offering manufacturers you hold no stock of
 * can only ever produce an empty page. They change rarely, so they are cached
 * for the session.
 */
const FACET_STALE_TIME = 5 * 60 * 1000;

export const facetQueries = {
  manufacturers: () =>
    queryOptions({
      queryKey: stockItemKeys.facet('manufacturers'),
      queryFn: ({ signal }) => listStockItemManufacturerFacets({ signal }),
      staleTime: FACET_STALE_TIME,
    }),
  facilities: () =>
    queryOptions({
      queryKey: stockItemKeys.facet('facilities'),
      queryFn: ({ signal }) => listStockItemFacilityFacets({ signal }),
      staleTime: FACET_STALE_TIME,
    }),
  physicalLocations: () =>
    queryOptions({
      queryKey: stockItemKeys.facet('physical-locations'),
      queryFn: ({ signal }) => listStockItemPhysicalLocationFacets({ signal }),
      staleTime: FACET_STALE_TIME,
    }),
  kitIds: () =>
    queryOptions({
      queryKey: stockItemKeys.facet('kit-ids'),
      queryFn: ({ signal }) => listInventoryKitManufacturerKitIds(undefined, { signal }),
      staleTime: FACET_STALE_TIME,
    }),
};
