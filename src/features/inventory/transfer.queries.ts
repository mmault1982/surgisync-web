import { queryOptions } from '@tanstack/react-query';

import { listInventoryTransferTargets } from '@/api/generated/endpoints/inventory/inventory';

import { transferKeys } from './inventory.keys';

/**
 * The From/To picker's options.
 *
 * Not one of the stock-item facets: those answer "what is in your stock", and a
 * destination the org holds no stock at yet is exactly the case a transfer
 * exists for. This endpoint answers "who may you send to" — the org's
 * representatives and the user's assignable facilities — and lives on
 * /inventory-transfers/, inside the backend's response accuracy gate.
 *
 * Cached for the session like the facets: memberships and facility assignments
 * change on a human clock, not a per-dialog one.
 */
const TARGETS_STALE_TIME = 5 * 60 * 1000;

export const transferQueries = {
  targets: () =>
    queryOptions({
      queryKey: transferKeys.targets(),
      queryFn: ({ signal }) => listInventoryTransferTargets({ signal }),
      staleTime: TARGETS_STALE_TIME,
    }),
};
