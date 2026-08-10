import type { OnHandSearch } from './on-hand.search';

/**
 * The only place inventory query keys are constructed.
 *
 * They lived in `on-hand.queries.ts` while that was the only screen. Kit Detail
 * makes a second queries module, and two files building keys for one resource
 * is how a filter change quietly reuses another screen's cache entry — so the
 * keys moved here and the queries modules import them.
 */
export const stockItemKeys = {
  all: ['stock-items'] as const,
  list: (search: OnHandSearch) => [...stockItemKeys.all, 'list', search] as const,
  facets: () => [...stockItemKeys.all, 'facets'] as const,
  facet: (name: string) => [...stockItemKeys.facets(), name] as const,
  detail: (id: number) => [...stockItemKeys.all, 'detail', id] as const,
  history: (id: number, pageSize: number) =>
    [...stockItemKeys.all, 'history', id, { pageSize }] as const,
};

/**
 * Trackers are a separate resource with their own lifetime, keyed on the
 * **tracker** id rather than the kit's — detaching a beacon must not be
 * invalidated by a stock-item mutation, or the reverse.
 *
 * `pageSize` is part of the key on purpose: the Live Location panel asks for
 * one event, and a future location-history screen will ask for twenty. Sharing
 * a key would have whichever loaded last clobber the other.
 */
export const trackerKeys = {
  all: ['trackers'] as const,
  events: (trackerId: number, pageSize: number) =>
    [...trackerKeys.all, trackerId, 'tracking-events', { pageSize }] as const,
};
