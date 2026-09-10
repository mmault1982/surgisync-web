import { useQuery } from '@tanstack/react-query';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';

import {
  deleteManufacturerCatalog,
  importManufacturersCatalog,
  manufacturerCatalogImportTemplate,
} from '@/api/generated/endpoints/inventory/inventory';
import type { Manufacturer } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { catalogKeys } from '@/features/inventory/inventory.keys';
import { DeleteDialog } from '@/components/delete-dialog';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { manufacturerKeys } from '../directory.keys';
import { MANUFACTURER_REASONS } from '../manufacturer-import';
import { manufacturerListQuery } from '../manufacturers.queries';
import { hasActiveSearch, type ManufacturerSearch } from '../manufacturers.search';

import { ImportDialog } from './import-dialog';
import { ManufacturersTable } from './manufacturers-table';

/**
 * Manufacturers, under Directory Profiles.
 *
 * Every manufacturer belongs to exactly one organization — `parent_company` is
 * NOT NULL on the model, and `list_manufacturers_catalog` says so in the
 * contract. There is no shared catalog, and this screen used to claim there
 * was in three places.
 *
 * Which rows can be edited is still the server's answer rather than a
 * client-side guess, because `is_owned` is False for anything a superuser or a
 * multi-membership user can see but not write.
 */
/**
 * The two query roots every manufacturer write refreshes.
 *
 * `manufacturerKeys` is this table; `catalogKeys` is the receive forms'
 * picker, which reads the same endpoint under a different key with its own
 * staleTime. It does *not* make a newly added manufacturer appear in that
 * picker — that filters on `has_items` and a new row has no catalog parts, as
 * the copy under the heading says.
 */
const INVALIDATES = [manufacturerKeys.all, catalogKeys.all] as const;

export function ManufacturersScreen({
  search,
  onSearchChange,
  onPageChange,
  onAdd,
  onOpen,
  onEdit,
}: {
  search: ManufacturerSearch;
  onSearchChange: (patch: Partial<ManufacturerSearch>) => void;
  onPageChange: (page: number) => void;
  /** Add and Edit are pages now, so both are the route's to navigate to. */
  onAdd: () => void;
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const query = useQuery(manufacturerListQuery(search));
  // Writes are org-admin only server-side. Offering the controls to
  // everyone would mean a rep fills in the form and learns on submit.
  const canManage = canManageOrgRecords(useAuth().user?.role);

  const [deleting, setDeleting] = useState<Manufacturer | null>(null);
  const [importing, setImporting] = useState(false);

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Manufacturers</h1>
      {/*
        Said plainly, because the alternative is finding out by not finding the
        manufacturer you just added. Receive / Load lists manufacturers that
        have a catalog (`has_items`), and a catalog is loaded separately from
        this screen — so adding one here does not by itself make it something
        you can receive against.
      */}
      <p className="mb-4 text-sm text-muted-foreground">
        Manufacturers your organization has added. Receiving stock against one also needs its
        catalog of parts, which is loaded separately — until then it will not be offered on Receive
        / Load.
      </p>

      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search manufacturers"
          placeholder="Search manufacturers…"
          defaultValue={search.search ?? ''}
          onChange={(event) => onSearchChange({ search: event.target.value.trim() || undefined })}
          className="min-w-64 max-w-sm"
        />
        {canManage ? (
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon />
              Import
            </Button>
            <Button type="button" onClick={onAdd}>
              <PlusIcon />
              Add manufacturer
            </Button>
          </div>
        ) : null}
      </header>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> manufacturers
        </div>

        {query.isPending ? (
          <TableLoading label="Loading manufacturers" />
        ) : query.isError ? (
          <TableError title="Could not load manufacturers" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          hasActiveSearch(search) ? (
            <TableEmpty
              title="No manufacturers match that search"
              description="Try a shorter term, or clear it."
              action={{
                label: 'Clear search',
                onClick: () => onSearchChange({ search: undefined }),
              }}
            />
          ) : (
            <TableEmpty
              title="No manufacturers yet"
              description={
                canManage
                  ? 'Add one to start receiving stock against it.'
                  : 'An administrator can add one for your organization.'
              }
            />
          )
        ) : (
          <>
            <ManufacturersTable
              rows={rows}
              canManage={canManage}
              onOpenRow={(row) => onOpen(row.id)}
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
          title={`Remove ${deleting.name}?`}
          description={
            'It stops appearing in your organization\u2019s lists and pickers. Stock already ' +
            'received keeps its manufacturer.'
          }
          conflictCode="manufacturer_in_use"
          onDelete={() => deleteManufacturerCatalog(deleting.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          title="Import manufacturers"
          description={
            <>
              A CSV or Excel file with a <strong>Name</strong> column, plus optional contact and
              address columns — everything this screen can edit. A name you already have is{' '}
              <strong>amended</strong> rather than duplicated, so the same file can be imported
              twice safely and a maintained spreadsheet can stay the source of truth. A blank cell
              is left alone rather than cleared, and a manufacturer cannot be renamed here. Download
              the template for the full column list. Imported manufacturers need a catalog of parts
              before stock can be received against them.
            </>
          }
          onImport={(file, dryRun) => importManufacturersCatalog({ file, dry_run: dryRun })}
          onTemplate={() => manufacturerCatalogImportTemplate()}
          templateFilename="manufacturers_template.csv"
          reasons={MANUFACTURER_REASONS}
          invalidates={INVALIDATES}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}
