import type { CatalogSearch } from './catalog.search';

/**
 * Query keys for the Product Catalog screen.
 *
 * Rooted at `['product-catalog']`, **not** at `catalogKeys` in
 * `features/inventory/inventory.keys.ts`, even though both read
 * `/api/v1/parts/`. That root is the Receive form's picker cache: one entry per
 * (manufacturer, kind) with a five-minute `staleTime` that the receive success
 * path deliberately never invalidates. This screen pages, sorts and filters on
 * every interaction and wants the previous page kept only until the next
 * arrives. Sharing a root would have a table interaction evict the picker's
 * warm cache, and a picker refresh land on a key this table then reuses for a
 * different filter set.
 *
 * Same reasoning `manufacturerKeys` is rooted apart from `catalogKeys`.
 */
export const productCatalogKeys = {
  all: ['product-catalog'] as const,
  list: (search: CatalogSearch) => [...productCatalogKeys.all, 'list', search] as const,
  facets: () => [...productCatalogKeys.all, 'facets'] as const,
  facet: (name: string) => [...productCatalogKeys.facets(), name] as const,
};
