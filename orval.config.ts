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
  //
  // Note this is NOT the Product Catalog screen's Manufacturer filter source —
  // that is `list_part_manufacturer_facets` below. This one is the global list
  // and `has_items` only narrows it to manufacturers with a catalog
  // *somewhere*, so on the dev seed 7 of its 12 values return nothing for a
  // given org. It stays here for the Receive form, which asks a different
  // question: who might I take delivery from.
  'list_manufacturers',
  'create_manufacturer',
  'retrieve_manufacturer',
  'partial_update_manufacturer',
  'delete_manufacturer',
  // Bulk import. `import_manufacturers` declares multipart/form-data *first*
  // among its content types, which is what makes the generated call able to
  // carry a file at all — the opposite of create_inventory_kit below, whose
  // JSON-first declaration is why photos go through a separate operation.
  // The template download returns a CSV body rather than JSON.
  'import_manufacturers',
  'manufacturer_import_template',

  // Directory Profiles → Procedures. Same shape as manufacturers above, on a
  // prefix that is *inside* the response-accuracy gate from its first commit —
  // nothing legacy squats /api/v1/procedures/, so it did not inherit the
  // problem /api/v1/manufacturers/ still has.
  //
  // Note the legacy `/api/v1/procedure_names/` is deliberately absent. It is
  // one of the known-bad operations, declaring a bare array while answering
  // {message, data}, and it stays that way for the shipped mobile app. This
  // list reads the new endpoint instead.
  'list_procedures_catalog',
  'create_procedure',
  'retrieve_procedure',
  'partial_update_procedure',
  'delete_procedure',
  'import_procedures',
  'procedure_import_template',

  // Directory Profiles → Surgeons, on /api/v1/directory/ — a new prefix
  // because /api/v1/surgeons/ is the legacy lookup, one of the known-bad
  // operations and frozen by three mobile call sites. That prefix is inside
  // the response-accuracy gate from its first commit.
  //
  // Two writable fields here rather than one: `npi_number` alongside `name`.
  'list_surgeons_catalog',
  'create_surgeon_catalog',
  'retrieve_surgeon',
  'partial_update_surgeon',
  'delete_surgeon',
  'import_surgeons',
  'surgeon_import_template',

  // The catalog, on /api/v1/parts/ — inside the response accuracy gate from
  // its first commit, so all six of these are verified rather than merely
  // documented. `list_parts` backs the Receive form's pickers and the Product
  // Catalog table; the facet operation is that table's Manufacturer column
  // menu, scoped by the same queryset as the listing so it cannot offer a
  // value that returns no rows.
  //
  // The four writes are the Product Catalog's Add / Edit / Delete and the
  // detail screen behind a row click. `/api/v1/parts/{id}/` did not exist
  // when this list was first written, which is what the note here used to
  // say; the screen needing it was a backend change rather than a reason to
  // hand-write the call.
  //
  // `retrieve_part` answers with a *wider* projection than `list_parts` —
  // `PartDetail` adds `udi` and `list_price`. The listing stays narrow on
  // purpose: it is also the Receive picker's source, and a picker has no
  // business being read as a pricing feed.
  //
  // Note `partial_update_part` is a PATCH and there is no PUT, the same
  // shape as manufacturers and procedures. `kind` is writable on create only
  // — it decides which identity space the row lives in, and the sync service
  // partitions the catalog table on the `source_kind` it is stamped with.
  'list_parts',
  'list_part_manufacturer_facets',
  'create_part',
  'retrieve_part',
  'partial_update_part',
  'delete_part',

  // Bulk import of the catalog, two files: the parts themselves, then the
  // bills of materials binding them into kits. Two endpoint pairs rather than
  // one that sniffs the header row, because the browser cannot read an .xlsx
  // header without shipping a spreadsheet parser — so the screen asks which
  // file this is with two buttons, and the client always knows.
  //
  // Both imports declare multipart/form-data *first* among their content
  // types, which is what makes the generated call able to carry a file at all
  // — the same property `import_manufacturers` above depends on. The two
  // template downloads return a CSV body rather than JSON, and serve the very
  // files `docs/import-templates/` ships rather than a header row retyped in
  // a view.
  //
  // These four are the reason `OutcomeEnum` gained `updated` and `ImportReport`
  // gained an `updated` count. The catalog import amends an existing part
  // rather than skipping it, which no directory importer does — so the three
  // above regenerate with a fourth enum value they will never emit. That is
  // one vocabulary rather than two, and the diff below is the whole cost.
  'import_parts',
  'parts_import_template',
  'import_kit_bom',
  'kit_bom_import_template',

  // The detail screen's Bill of Materials panel: a kit's components, nested
  // *under* the part at `/api/v1/parts/{id}/components/`. Nesting is what puts
  // them inside the response accuracy gate without a new prefix, and it is why
  // they are tagged `Inventory` and survive `input.filters.tags` below.
  //
  // Deliberately not `/api/v1/kit-items/`, which already models this junction
  // and is unusable from here for four separate reasons: every operation is
  // tagged `api`, so the filter drops it silently; the prefix is outside the
  // accuracy gate; `by-kit/{kit_id}/` declares one object while returning an
  // array; and the `?kit=` filter it documents in prose is not a declared
  // parameter, so a generated client could not pass it and would render every
  // BOM row in the organization. It stays where it is for the mobile and
  // pricing clients that read it.
  //
  // Note `delete_part_component` is a real 204, unlike `delete_part` next to
  // it — a junction row is template membership, so there is no updated record
  // to hand back.
  'list_part_components',
  'create_part_component',
  'partial_update_part_component',
  'delete_part_component',

  // Configuration / Hansel. `/api/v1/integrations/` was added to the backend's
  // VALIDATED_PATH_PREFIXES in the same commit that created it, so these are
  // gated from the start — no repeat of the tracker_tracking_events dig.
  //
  // `hansel_credential_retrieve` is deliberately absent. The collection is one
  // row per (organization, workspace) and the screen renders every field it
  // shows straight off the list, so a detail fetch would only duplicate a row
  // this app already holds.
  'hansel_credential_list',
  'hansel_credential_create',
  'hansel_credential_partial_update',
  'hansel_credential_destroy',
  'hansel_credential_verify',
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
      //
      // It is also not optional. An operationId added to ALLOWED_OPERATIONS
      // whose tag is missing here survives the transformer and is then dropped
      // by this filter — the generated directory simply never appears, with no
      // error. `Integrations` is here for the Hansel credential operations.
      filters: {
        mode: 'include',
        tags: ['Inventory', 'Authentication', 'Tracking', 'Integrations'],
      },

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
