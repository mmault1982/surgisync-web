import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { deletePart } from '@/api/generated/endpoints/inventory/inventory';
import type { PartList } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { DeleteDialog } from '@/components/delete-dialog';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { productCatalogKeys } from '../catalog.keys';
import { catalogListQuery } from '../catalog.queries';
import { catalogLabel, hasActiveFilters, type CatalogSearch } from '../catalog.search';

import { CatalogFilterChips } from './catalog-filter-chips';
import { ProductCatalogTable } from './product-catalog-table';

/**
 * Both roots. `catalogKeys` is the Receive form's picker cache, which reads
 * the same endpoint under a separate root with a five-minute staleTime — a
 * part removed here would otherwise stay receivable for five minutes.
 */
const INVALIDATES = [productCatalogKeys.all, catalogKeys.all] as const;

/**
 * Product Catalog, under Inventory.
 *
 * What the organization can *choose* — the parts of the manufacturers it owns
 * — as against Manage On-Hand, which is what it physically *holds*. The two
 * read different endpoints and a part appears here whether or not any stock of
 * it exists.
 *
 * There is no shared tier. `Manufacturer.parent_company` is NOT NULL, so every
 * part belongs to exactly one organization, and `scope_parts_to_org` reaches
 * the owner through the manufacturer. That is also what makes every row here
 * writable by an admin — unlike the Directory screens, which have shared rows
 * to render an inert `Shared` label against.
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
  onAdd,
  onOpenRow,
  onEdit,
}: {
  search: CatalogSearch;
  onSearchChange: (patch: Partial<CatalogSearch>) => void;
  onClearAll: () => void;
  onPageChange: (page: number) => void;
  onAdd: () => void;
  onOpenRow: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const query = useQuery(catalogListQuery(search));
  const canManage = canManageOrgRecords(useAuth().user?.role);

  // Delete stays here rather than in the route: it is a dialog over this list,
  // and the list is what has to refetch afterwards.
  const [deleting, setDeleting] = useState<PartList | null>(null);

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Product Catalog</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Parts your organization can receive stock against — the catalogs of the manufacturers you
        own. This is not stock on hand; a part is listed here whether or not you hold any.
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
        {canManage ? (
          <div className="ml-auto flex gap-2">
            <Button type="button" onClick={onAdd}>
              <PlusIcon />
              Add product
            </Button>
          </div>
        ) : null}
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
                canManage
                  ? 'Add one, or load a manufacturer’s catalog separately from this screen.'
                  : 'An administrator can add one for your organization.'
              }
              action={canManage ? { label: 'Add product', onClick: onAdd } : undefined}
            />
          )
        ) : (
          <>
            <ProductCatalogTable
              rows={rows}
              search={search}
              onSearchChange={onSearchChange}
              canManage={canManage}
              onOpenRow={onOpenRow}
              onEdit={(row) => onEdit(row.id)}
              onDelete={setDeleting}
            />
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

      {deleting ? (
        <DeleteDialog
          title={`Remove ${catalogLabel(deleting)}?`}
          description={
            'It stops appearing in your catalog and in the Receive form’s pickers. Stock you ' +
            'already hold keeps it, and it cannot be removed while any of that stock exists.'
          }
          conflictCode="part_in_use"
          onDelete={() => deletePart(deleting.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
