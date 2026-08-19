import { useQuery } from '@tanstack/react-query';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';

import {
  deleteSurgeon,
  importSurgeons,
  surgeonImportTemplate,
} from '@/api/generated/endpoints/inventory/inventory';
import type { SurgeonCatalog } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { surgeonKeys } from '../directory.keys';
import { canManageDirectory } from '../permissions';
import { surgeonListQuery } from '../surgeons.queries';
import { hasActiveSearch, type SurgeonSearch } from '../surgeons.search';

import { DeleteDialog } from './delete-dialog';
import { ImportDialog } from './import-dialog';
import { SurgeonDialog } from './surgeon-dialog';
import { SurgeonsTable } from './surgeons-table';

const INVALIDATES = [surgeonKeys.all] as const;

/**
 * Surgeons, under Directory Profiles.
 *
 * The list is the shared roster plus the ones this organization added; only
 * the latter can be amended, and the server decides which those are.
 */
export function SurgeonsScreen({
  search,
  onSearchChange,
  onPageChange,
}: {
  search: SurgeonSearch;
  onSearchChange: (patch: Partial<SurgeonSearch>) => void;
  onPageChange: (page: number) => void;
}) {
  const query = useQuery(surgeonListQuery(search));
  const canManage = canManageDirectory(useAuth().user?.role);

  const [editing, setEditing] = useState<SurgeonCatalog | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<SurgeonCatalog | null>(null);
  const [importing, setImporting] = useState(false);

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Surgeons</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Surgeons your organization has added, alongside the shared roster. These fill the surgeon
        picker when a case is created.
      </p>

      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search surgeons"
          placeholder="Search by name or NPI…"
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
              Add surgeon
            </Button>
          </div>
        ) : null}
      </header>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> surgeons
        </div>

        {query.isPending ? (
          <TableLoading label="Loading surgeons" />
        ) : query.isError ? (
          <TableError title="Could not load surgeons" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          hasActiveSearch(search) ? (
            <TableEmpty
              title="No surgeons match that search"
              description="Try a shorter term, or clear it."
              action={{
                label: 'Clear search',
                onClick: () => onSearchChange({ search: undefined }),
              }}
            />
          ) : (
            <TableEmpty
              title="No surgeons yet"
              description={
                canManage
                  ? 'Add one, or import a list.'
                  : 'An administrator can add one for your organization.'
              }
            />
          )
        ) : (
          <>
            <SurgeonsTable
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

      {editing !== undefined ? (
        <SurgeonDialog surgeon={editing} onClose={() => setEditing(undefined)} />
      ) : null}
      {deleting ? (
        <DeleteDialog
          title={`Remove ${deleting.name}?`}
          description={
            'They stop appearing in your lists and pickers. Cases they are already on keep ' +
            'them, and they cannot be removed while any case or facility assignment refers to ' +
            'them.'
          }
          conflictCode="surgeon_in_use"
          onDelete={() => deleteSurgeon(deleting.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          title="Import surgeons"
          description={
            <>
              A CSV or Excel file with a <strong>name</strong> column and an optional{' '}
              <strong>npi_number</strong> column. Surgeons already available to you are left alone,
              matched on NPI where a row has one. A row whose NPI is not 10 digits fails rather than
              being imported without it.
            </>
          }
          onImport={(file, dryRun) => importSurgeons({ file, dry_run: dryRun })}
          onTemplate={() => surgeonImportTemplate()}
          templateFilename="surgeons_template.csv"
          invalidates={INVALIDATES}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}
