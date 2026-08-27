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
  detail: (id: number) => [...productCatalogKeys.all, 'detail', id] as const,
  facets: () => [...productCatalogKeys.all, 'facets'] as const,
  facet: (name: string) => [...productCatalogKeys.facets(), name] as const,
};

/**
 * The manufacturers the product form may file a part under.
 *
 * Rooted apart from `productCatalogKeys` on purpose. Everything under that
 * root is derived from `/api/v1/parts/` and is invalidated whenever a part is
 * written; this list is not — adding a part does not change who exists. Under
 * the same root, every save would evict a list that had not changed.
 */
export const partFormKeys = {
  all: ['product-form'] as const,
  manufacturers: () => [...partFormKeys.all, 'manufacturers'] as const,
};
