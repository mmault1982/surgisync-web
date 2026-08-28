import { queryOptions } from '@tanstack/react-query';

import { listManufacturers, listParts } from '@/api/generated/endpoints/inventory/inventory';
import { ListPartsKind } from '@/api/generated/model';

import { catalogKeys } from './inventory.keys';

/**
 * The Receive form's option lists.
 *
 * Two of the four sources it needs are already wired elsewhere and are reused
 * rather than duplicated: the Rep picker reads `transferQueries.targets()`, and
 * Physical Location reads `facetQueries.physicalLocations()`. Only the catalog
 * is new, and it is what lives here.
 *
 * Cached for the session. A catalog changes on a human clock — far slower than
 * the stock built on top of it — and the success path deliberately does not
 * invalidate it (see `catalogKeys`).
 */
const CATALOG_STALE_TIME = 5 * 60 * 1000;

export const catalogQueries = {
  /**
   * Manufacturers to receive *from*.
   *
   * Not `facetQueries.manufacturers()`, which answers "whose stock do you
   * already hold" — the wrong set for a screen whose entire purpose is taking
   * delivery of stock you do not have yet.
   *
   * `has_items` narrows it to manufacturers with an active catalog, which is
   * the best this endpoint can do. It is still the **global** catalog rather
   * than the organization's, so a manufacturer whose kits this org cannot
   * receive remains selectable — see `partsQuery`'s note.
   *
   * **A manufacturer added on the Manufacturers screen does not appear here**,
   * and that is the filter working rather than a caching bug: it has no
   * catalog parts, so the server excludes it. Nor would showing it help — Kit
   * mode needs catalog kits and SKU mode needs a part carrying the typed
   * reference number, and this app can load neither. The Manufacturers screen
   * says so rather than leaving it to be discovered here.
   *
   * One page holds the whole catalog by design (the endpoint's default page is
   * wide), so nothing here pages.
   */
  manufacturers: () =>
    queryOptions({
      queryKey: catalogKeys.manufacturers(),
      queryFn: ({ signal }) => listManufacturers({ has_items: true }, { signal }),
      staleTime: CATALOG_STALE_TIME,
      // The response also carries a deprecated `data` duplicating `results`,
      // alive only until the shipped Flutter build that reads it is replaced.
      // Selecting here means exactly one line in this app knows that, and it
      // is the line that gets deleted when the key goes.
      select: (page) => page.results,
    }),

  /**
   * The catalog kits of one manufacturer.
   *
   * `enabled` rather than a conditional call: Kit Name is inert until a
   * manufacturer is chosen, and asking for every kit in the catalog to fill a
   * disabled control would be a large request for a list nobody can see.
   *
   * **An empty result is a real answer, not an error.** `/parts/` is scoped to
   * the organization's catalog while `/manufacturers/` is global, so a
   * perfectly valid manufacturer can have no kits this org may receive. The
   * form says so rather than showing an enabled, empty select.
   */
  parts: (manufacturerId: number | null) =>
    queryOptions({
      queryKey: catalogKeys.parts(manufacturerId, ListPartsKind.kit),
      queryFn: ({ signal }) =>
        listParts(
          // `kind` is not optional in practice. Without it the picker offers
          // loose components too, and the create endpoint would accept one —
          // filing a component as though it were a kit, with no error.
          //
          // `manufacturer_id` is a list because the parameter is repeatable and
          // now says so in the schema. This picker only ever asks about one
          // manufacturer, so it sends a one-element list; the `enabled` guard
          // below is what keeps `null` from reaching here.
          {
            manufacturer_id: manufacturerId === null ? undefined : [manufacturerId],
            kind: ListPartsKind.kit,
          },
          { signal },
        ),
      enabled: manufacturerId !== null,
      staleTime: CATALOG_STALE_TIME,
      select: (page) => page.results,
    }),
};
