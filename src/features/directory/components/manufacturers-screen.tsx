import { useQuery } from '@tanstack/react-query';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';

import {
  createManufacturer,
  deleteManufacturer,
  importManufacturers,
  manufacturerImportTemplate,
  partialUpdateManufacturer,
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
import { manufacturerListQuery } from '../manufacturers.queries';
import { hasActiveSearch, type ManufacturerSearch } from '../manufacturers.search';

import { ImportDialog } from './import-dialog';
import { NameDialog } from './name-dialog';
import { ManufacturersTable } from './manufacturers-table';

/**
 * Manufacturers, under Directory Profiles.
 *
 * The list is the shared catalog plus the ones this organization owns; only
 * the owned ones can be edited, and the server decides which those are — a
 * client-side guess would either hide rows it should not or offer edits the
 * server will 404.
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
}: {
  search: ManufacturerSearch;
  onSearchChange: (patch: Partial<ManufacturerSearch>) => void;
  onPageChange: (page: number) => void;
}) {
  const query = useQuery(manufacturerListQuery(search));
  // Writes are org-admin only server-side. Offering the controls to
  // everyone would mean a rep fills in the form and learns on submit.
  const canManage = canManageOrgRecords(useAuth().user?.role);

  // `undefined` closed, `null` open-for-create, a row open-for-rename. One
  // piece of state rather than two booleans, so "adding" and "renaming" cannot
  // both be true.
  const [editing, setEditing] = useState<Manufacturer | null | undefined>(undefined);
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
        Manufacturers your organization has added, alongside the shared catalog. Receiving stock
        against one also needs its catalog of parts, which is loaded separately — until then it will
        not be offered on Receive / Load.
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
            <Button type="button" onClick={() => setEditing(null)}>
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
              onEdit={setEditing}
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

      {/*
        Mounted only while open, so a draft name cannot outlive a close and
        every open reseeds from the row — the same rule kit-actions.tsx applies
        to the Kit Detail dialogs.
      */}
      {editing !== undefined ? (
        <NameDialog
          title={editing ? 'Rename manufacturer' : 'Add manufacturer'}
          description={
            editing
              ? 'The new name appears everywhere this manufacturer is listed.'
              : 'Visible to your organization only. A name already in the shared ' +
                'catalog counts as a duplicate.'
          }
          initialName={editing?.name ?? ''}
          isRename={editing !== null}
          onSave={(name) =>
            editing ? partialUpdateManufacturer(editing.id, { name }) : createManufacturer({ name })
          }
          invalidates={INVALIDATES}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          title={`Remove ${deleting.name}?`}
          description={
            'It stops appearing in your organization\u2019s lists and pickers. Stock already ' +
            'received keeps its manufacturer.'
          }
          conflictCode="manufacturer_in_use"
          onDelete={() => deleteManufacturer(deleting.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          title="Import manufacturers"
          description={
            <>
              A CSV or Excel file with a single column headed <strong>name</strong>. Names already
              available to you — your own or the shared catalog — are left alone, so the same file
              can be imported twice safely. Imported manufacturers need a catalog of parts before
              stock can be received against them.
            </>
          }
          onImport={(file, dryRun) => importManufacturers({ file, dry_run: dryRun })}
          onTemplate={() => manufacturerImportTemplate()}
          templateFilename="manufacturers_template.csv"
          invalidates={INVALIDATES}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}
