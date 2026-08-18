import { useQuery } from '@tanstack/react-query';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';

import type { Manufacturer } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { canManageManufacturers } from '../manufacturers';
import { manufacturerListQuery } from '../manufacturers.queries';
import { hasActiveSearch, type ManufacturerSearch } from '../manufacturers.search';

import { DeleteManufacturerDialog } from './delete-manufacturer-dialog';
import { ManufacturerImportDialog } from './manufacturer-import-dialog';
import { ManufacturerDialog } from './manufacturer-dialog';
import { ManufacturersTable } from './manufacturers-table';

/**
 * Manufacturers, under Directory Profiles.
 *
 * The list is the shared catalog plus the ones this organization owns; only
 * the owned ones can be edited, and the server decides which those are — a
 * client-side guess would either hide rows it should not or offer edits the
 * server will 404.
 */
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
  const canManage = canManageManufacturers(useAuth().user?.role);

  // `undefined` closed, `null` open-for-create, a row open-for-rename. One
  // piece of state rather than two booleans, so "adding" and "renaming" cannot
  // both be true.
  const [editing, setEditing] = useState<Manufacturer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Manufacturer | null>(null);
  const [importing, setImporting] = useState(false);

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-primary">Manufacturers</h1>

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
        <ManufacturerDialog manufacturer={editing} onClose={() => setEditing(undefined)} />
      ) : null}
      {deleting ? (
        <DeleteManufacturerDialog manufacturer={deleting} onClose={() => setDeleting(null)} />
      ) : null}
      {importing ? <ManufacturerImportDialog onClose={() => setImporting(false)} /> : null}
    </div>
  );
}
