import { defineConfig } from 'orval';

/**
 * Every operation this app is allowed to call.
 *
 * The contract documents 143 operations across 88 paths; this app needs a
 * handful. Generating all of them would produce a client nobody can review and
 * would quietly invite screens to depend on endpoints whose schemas the backend
 * does not verify — only `/stock-items/`, `/inventory-kits/`,
 * `/inventory-transfers/` and `/api/v1/web/` are covered by its response
 * accuracy gate. Several reference endpoints outside that set are known to
 * declare a bare array while returning `{message, data}`, so a generated client
 * for them would compile and then fail at runtime.
 *
 * Adding a screen therefore means adding its operationId here, deliberately.
 * If a screen needs something this client cannot express, that is a backend
 * schema bug — not a reason to hand-write a call.
 */
const ALLOWED_OPERATIONS = new Set([
  // Browser auth — the refresh cookie flow.
  'web_login',
  'web_token_refresh',
  'web_logout',

  // Manage On-Hand.
  'api_v1_stock_items_list',
  'api_v1_stock_items_retrieve',

  // Kit Detail. The history endpoint hangs off /stock-items/, so it is inside
  // the backend's response accuracy gate like the two above.
  'list_inventory_kit_history',

  // Detaching a beacon. On /stock-items/, so inside the accuracy gate — and
  // note it is a DELETE that returns 200 with the updated kit, not a 204; the
  // schema says so because a bare serializer in `responses=` gets rewritten to
  // 204 and this one is status-keyed. Attaching needs no entry: it is a
  // `beacon_id` on the PATCH below.
  'detach_inventory_kit_tracker',

  // Kit Detail's Live Location panel. This one is /trackers/, which is
  // *outside* that gate — the hazard this allowlist exists to guard against.
  // Verified two ways before adding it, so nobody has to repeat the dig:
  // tracking/views.py returns get_paginated_response() through the house
  // CustomPagination, and tests/tracking/test_tracker_api.py asserts the
  // {total_data, total_pages, current_page, results} keys. It is a real
  // paginated envelope, not one of the bare-array-vs-{message,data} liars.
  // Worth asking the backend to extend its gate to /trackers/.
  'tracker_tracking_events',

  // Kit Detail's Update Status dialog. All three hang off /stock-items/, so
  // they are inside the response accuracy gate. The PATCH is the app's first
  // write; the photo pair is multipart in, 204 out.
  'api_v1_stock_items_partial_update',
  'create_inventory_kit_photo',
  'delete_inventory_kit_photo',

  // Kit Detail's Transfer dialog. Both hang off /inventory-transfers/, so both
  // are inside the response accuracy gate. `targets` exists because the global
  // /facilities/ this needs is one of the liars below: it was added to the
  // backend for this screen, on that prefix so it was gated from its first
  // commit rather than allowlisted ungated the way tracker events had to be.
  'create_inventory_transfer',
  'list_inventory_transfer_targets',

  // Kit Detail's Pending Transfer dialog: read the transfer a kit is on, then
  // complete it. `retrieve` is what lets the dialog show what is arriving
  // rather than asking the user to confirm a shipment sight unseen — the kit
  // itself carries only the destination's name. Confirming is idempotent by
  // way of 404: the viewset scopes to active transfers, so a second confirm
  // finds nothing.
  'api_v1_inventory_transfers_retrieve',
  'confirm_inventory_transfer_receipt',

  // Value sources for the table's column filter menus. These return only what
  // this organization actually holds — the global /facilities/ endpoint is
  // deliberately not used, since its schema does not match what it returns.
  'list_stock_item_manufacturer_facets',
  'list_stock_item_facility_facets',
  'list_stock_item_physical_location_facets',
  'list_inventory_kit_manufacturer_kit_ids',

  // Receive / Load. The write is on /stock-items/, so it is inside the
  // response accuracy gate. Note it declares application/json *first* among
  // its three request content types, so the generated call posts JSON and a
  // File in the body would be silently dropped — photos go through
  // create_inventory_kit_photo above, which is multipart-first.
  'create_inventory_kit',

  // The Receive form's catalog pickers.
  //
  // `list_parts` is /api/v1/parts/, a prefix added to VALIDATED_PATH_PREFIXES
  // in the same commit that created it, so it is gated from the start.
  //
  // The five /api/v1/manufacturers/ operations are the exception on this list
  // and the caveat matters: that prefix is *outside* the gate, the same
  // position tracker_tracking_events is in. The three legacy case/quote
  // operations sharing it (get_manufacturer_kits, get_manufacturer_kits_by_ids,
  // get_category_items) still declare no response at all, so the prefix cannot
  // be gated until those are documented — backend #43 left that as its own
  // change rather than folding it in. The five below each document every
  // status they emit, so what is missing is enforcement, not description.
  //
  // `list_manufacturers` also still carries a deprecated `data` key
  // duplicating `results`, for shipped Flutter builds only. Read `results`.
  'list_manufacturers',
  'create_manufacturer',
  'retrieve_manufacturer',
  'partial_update_manufacturer',
  'delete_manufacturer',
  'list_parts',
]);

const VERBS = ['get', 'put', 'post', 'delete', 'patch'] as const;

export default defineConfig({
  surgisync: {
    input: {
      // The vendored copy, never the live URL: codegen must be offline and
      // deterministic. `pnpm api:pull` refreshes it. See schema/SOURCE.md.
      target: './schema/openapi.yaml',

      // Coarse pre-filter. With tags set, orval prunes components to just what
      // the surviving operations reference (108 -> a handful).
      //
      // This runs *after* the transformer below, not before, so widening it is
      // safe: `Tracking` is here only for `tracker_tracking_events` (its sole
      // operation), and the transformer has already deleted anything else.
      filters: { mode: 'include', tags: ['Inventory', 'Authentication', 'Tracking'] },

      override: {
        // Tags alone are far too coarse — `Inventory` is 42 operations
        // including the whole deprecated /inventory-kits/ spelling. orval has
        // no path or operationId filter, so prune the spec directly.
        transformer: (spec) => {
          for (const [path, item] of Object.entries(spec.paths ?? {})) {
            const pathItem = item as Record<string, { operationId?: string }>;
            for (const verb of VERBS) {
              const operation = pathItem[verb];
              if (operation && !ALLOWED_OPERATIONS.has(operation.operationId ?? '')) {
                delete pathItem[verb];
              }
            }
            const remaining = Object.keys(pathItem).filter((k) =>
              (VERBS as readonly string[]).includes(k),
            );
            if (remaining.length === 0) delete spec.paths![path];
          }
          return spec;
        },
      },
    },

    output: {
      mode: 'tags-split',
      target: './src/api/generated/endpoints',
      schemas: './src/api/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      // Removing an operation from ALLOWED_OPERATIONS deletes its file rather
      // than leaving an orphan that still typechecks.
      clean: true,
      indexFiles: true,
      // orval 8 takes a generators array here (7 took `{ type: 'msw' }`).
      mock: { generators: [{ type: 'msw', delay: false, baseUrl: '' }] },
      override: {
        mutator: { path: './src/api/axios-instance.ts', name: 'apiRequest' },
        query: { useQuery: true, signal: true },
        // paramsSerializerOptions is deliberately unset: orval would inline a
        // qs-based serializer into every call site and add a `qs` dependency.
        // The instance-level serializer in axios-instance.ts covers generated
        // and hand-written calls alike, in one place. It is not optional — see
        // the comment there.
      },
    },
  },
});
