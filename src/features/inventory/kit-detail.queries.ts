import { queryOptions } from '@tanstack/react-query';

import {
  apiV1StockItemsRetrieve,
  listInventoryKitHistory,
} from '@/api/generated/endpoints/inventory/inventory';
import { trackerTrackingEvents } from '@/api/generated/endpoints/tracking/tracking';

import { stockItemKeys, trackerKeys } from './inventory.keys';

/**
 * Kit Detail's three reads.
 *
 * Only the first is in the route loader. The other two are secondary content —
 * a change-log outage or an unreachable beacon must never stop the kit itself
 * rendering, which is the same call the mobile screen makes with its `quiet`
 * flag.
 */

export function kitDetailQuery(id: number) {
  return queryOptions({
    queryKey: stockItemKeys.detail(id),
    queryFn: ({ signal }) => apiV1StockItemsRetrieve(id, { signal }),
  });
}

/** The activity card shows the newest few; the endpoint is already newest-first. */
export const HISTORY_PAGE_SIZE = 5;

export function kitHistoryQuery(id: number, pageSize = HISTORY_PAGE_SIZE) {
  return queryOptions({
    queryKey: stockItemKeys.history(id, pageSize),
    queryFn: ({ signal }) => listInventoryKitHistory(id, { page_size: pageSize }, { signal }),
  });
}

/**
 * One event is all the Live Location panel needs: the endpoint is ordered
 * newest-first and excludes autoclave cycles, so `results[0]` is the current
 * position.
 */
export const TRACKING_PAGE_SIZE = 1;

export function trackingEventsQuery(trackerId: number | null, pageSize = TRACKING_PAGE_SIZE) {
  return queryOptions({
    // Keyed on a non-null id even when disabled — the key is never read in that
    // state, and the alternative is making every key branch on null.
    queryKey: trackerKeys.events(trackerId ?? 0, pageSize),
    queryFn: ({ signal }) => trackerTrackingEvents(trackerId!, { page_size: pageSize }, { signal }),
    enabled: trackerId !== null,
  });
}
