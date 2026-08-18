import { useQuery } from '@tanstack/react-query';
import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { ActiveFilterChips } from '@/features/inventory/components/active-filter-chips';
import { OnHandTable } from '@/features/inventory/components/on-hand-table';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { onHandListQuery } from '@/features/inventory/on-hand.queries';
import {
  ON_HAND_DEFAULTS,
  hasActiveFilters,
  onHandSearchSchema,
  type OnHandSearch,
} from '@/features/inventory/on-hand.search';
import {
  getSelectedIds,
  subscribe,
  toggleSelected,
  toggleSelectedAll,
} from '@/features/inventory/selection-store';
import { STRIPE_CLASSES, STRIPE_LEGEND } from '@/features/inventory/stock-status';

export const Route = createFileRoute('/_authenticated/inventory/on-hand')({
  validateSearch: onHandSearchSchema,
  search: {
    middlewares: [
      // Page size and sort follow you across navigations; the filters do not.
      retainSearchParams(['page_size', 'ordering']),
      // Keep shared URLs to what actually differs from the default.
      stripSearchParams(ON_HAND_DEFAULTS),
    ],
  },
  // Re-runs the loader whenever any filter changes, so a deep link renders the
  // right rows on first paint rather than after a flash of the unfiltered set.
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(onHandListQuery(deps)),
  component: OnHandPage,
});

function OnHandPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useQuery(onHandListQuery(search));

  // Held in a module-scope store, not useState: opening a kit unmounts this
  // route, and component state would take the selection with it. See the
  // docblock in selection-store.ts.
  const selected = useSyncExternalStore(subscribe, getSelectedIds);

  /**
   * Any filter change resets to page 1 — page 4 of the old filter set is not
   * page 4 of the new one, and the paginator 404s past the last page.
   * `replace` keeps Back meaning "the previous screen" rather than "the
   * previous checkbox", which matters with this many filter dimensions.
   */
  const setFilters = (patch: Partial<OnHandSearch>) => {
    void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });
  };

  const goToPage = (page: number) => {
    void navigate({ search: (prev) => ({ ...prev, page }) });
  };

  const clearAll = () => {
    void navigate({ search: () => ({ ...ON_HAND_DEFAULTS }), replace: true });
  };

  // Navigation lives here rather than in the table, so the table stays
  // presentational — the same split every other component on this screen makes.
  const openRow = (id: number) => {
    void navigate({
      to: '/inventory/on-hand/$stockItemId',
      params: { stockItemId: String(id) },
    });
  };

  const rows = query.data?.results ?? [];

  const toggleRow = (id: number) => toggleSelected(id);

  // Scoped to the rows on screen — the store is deliberately ignorant of paging
  // and filtering, so the visible ids have to come from here.
  const toggleAllVisible = () => toggleSelectedAll(rows.map((row) => row.id));

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand">Manage On-Hand</h1>
        <input
          type="search"
          defaultValue={search.search ?? ''}
          placeholder="Search kit ID, name, or location…"
          aria-label="Search inventory"
          onChange={(event) => setFilters({ search: event.target.value.trim() || undefined })}
          className="min-w-64 rounded-lg border-2 border-brand/30 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </header>

      <StripeLegend />

      <ActiveFilterChips search={search} onChange={setFilters} onClearAll={clearAll} />

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> kits on hand
          {selected.size > 0 && ` · ${selected.size} selected`}
        </div>

        {query.isPending ? (
          <TableLoading label="Loading inventory" />
        ) : query.isError ? (
          <TableError title="Could not load inventory" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          hasActiveFilters(search) ? (
            <TableEmpty
              title="No kits match these filters"
              description="Try removing one, or clear them all."
              action={{ label: 'Clear all filters', onClick: clearAll }}
            />
          ) : (
            <TableEmpty
              title="No inventory yet"
              description="Stock you receive will appear here."
            />
          )
        ) : (
          <>
            <OnHandTable
              rows={rows}
              search={search}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAllVisible}
              onSearchChange={setFilters}
              onOpenRow={openRow}
            />
            <Pagination
              page={query.data.current_page}
              pageSize={search.page_size}
              totalItems={query.data.total_data}
              totalPages={query.data.total_pages}
              onPageChange={goToPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

function StripeLegend() {
  return (
    <details className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
      <summary className="cursor-pointer text-gray-700">Row stripe colours</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STRIPE_LEGEND.map((entry) => (
          <span key={entry.tone} className="flex items-center gap-2 text-xs text-gray-700">
            <span className={`h-4 w-1 rounded-sm ${STRIPE_CLASSES[entry.tone]}`} />
            {entry.label}
          </span>
        ))}
      </div>
    </details>
  );
}
