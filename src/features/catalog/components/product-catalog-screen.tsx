import { useQuery } from '@tanstack/react-query';

import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Input } from '@/components/ui/input';

import { catalogListQuery } from '../catalog.queries';
import { hasActiveFilters, type CatalogSearch } from '../catalog.search';

import { CatalogFilterChips } from './catalog-filter-chips';
import { ProductCatalogTable } from './product-catalog-table';

/**
 * Product Catalog, under Inventory.
 *
 * What the organization can *choose* — the shared catalog plus the parts of
 * manufacturers it owns — as against Manage On-Hand, which is what it
 * physically *holds*. The two read different endpoints and a part appears here
 * whether or not any stock of it exists.
 *
 * Presentational: it takes its state and its callbacks as props, so it renders
 * without a router. Navigation lives in the route file, the same split the
 * Manufacturers screen makes.
 */
export function ProductCatalogScreen({
  search,
  onSearchChange,
  onClearAll,
  onPageChange,
}: {
  search: CatalogSearch;
  onSearchChange: (patch: Partial<CatalogSearch>) => void;
  onClearAll: () => void;
  onPageChange: (page: number) => void;
}) {
  const query = useQuery(catalogListQuery(search));

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Product Catalog</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Parts your organization can receive stock against — the shared catalog alongside those of
        the manufacturers you own. This is not stock on hand; a part is listed here whether or not
        you hold any.
      </p>

      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search catalog"
          placeholder="Search name, manufacturer or reference #…"
          // Uncontrolled: a controlled value would re-seed the box from the URL
          // on every keystroke's navigation and fight the cursor.
          defaultValue={search.search ?? ''}
          onChange={(event) => onSearchChange({ search: event.target.value.trim() || undefined })}
          className="max-w-sm min-w-64"
        />
      </header>

      <CatalogFilterChips search={search} onChange={onSearchChange} onClearAll={onClearAll} />

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> catalog parts
        </div>

        {query.isPending ? (
          <TableLoading label="Loading catalog" />
        ) : query.isError ? (
          <TableError title="Could not load the catalog" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          // Two flavours, because "nothing matches" and "nothing here" want
          // different next actions and only one of them is the user's to fix.
          hasActiveFilters(search) ? (
            <TableEmpty
              title="No parts match these filters"
              description="Try a shorter search term, or remove a filter."
              action={{ label: 'Clear all filters', onClick: onClearAll }}
            />
          ) : (
            <TableEmpty
              title="No catalog parts yet"
              description={
                'Your organization can see the shared catalog plus the parts of manufacturers ' +
                'it owns. Loading a manufacturer’s catalog is done separately from this ' +
                'screen.'
              }
            />
          )
        ) : (
          <>
            <ProductCatalogTable rows={rows} search={search} onSearchChange={onSearchChange} />
            <Pagination
              page={query.data.current_page}
              pageSize={search.page_size}
              totalItems={query.data.total_data}
              totalPages={query.data.total_pages}
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
