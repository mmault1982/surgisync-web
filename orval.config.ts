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
      filters: { mode: 'include', tags: ['Inventory', 'Authentication'] },

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
