import { useQuery } from '@tanstack/react-query';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';

import {
  createProcedure,
  deleteProcedure,
  importProcedures,
  partialUpdateProcedure,
  procedureImportTemplate,
} from '@/api/generated/endpoints/inventory/inventory';
import type { ProcedureCatalog } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { procedureKeys } from '../directory.keys';
import { canManageDirectory } from '../permissions';
import { procedureListQuery } from '../procedures.queries';
import { hasActiveSearch, type ProcedureSearch } from '../procedures.search';

import { DeleteDialog } from './delete-dialog';
import { ImportDialog } from './import-dialog';
import { NameDialog } from './name-dialog';
import { ProceduresTable } from './procedures-table';

/**
 * Procedures, under Directory Profiles.
 *
 * The list is the shared catalog — the procedures every organization reads —
 * plus the ones this organization added. Only the latter can be edited, and
 * the server decides which those are.
 */
const INVALIDATES = [procedureKeys.all] as const;

export function ProceduresScreen({
  search,
  onSearchChange,
  onPageChange,
}: {
  search: ProcedureSearch;
  onSearchChange: (patch: Partial<ProcedureSearch>) => void;
  onPageChange: (page: number) => void;
}) {
  const query = useQuery(procedureListQuery(search));
  const canManage = canManageDirectory(useAuth().user?.role);

  const [editing, setEditing] = useState<ProcedureCatalog | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ProcedureCatalog | null>(null);
  const [importing, setImporting] = useState(false);

  const rows = query.data?.results ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Procedures</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Procedures your organization has added, alongside the shared catalog. These fill the
        procedure picker when a case or quote is created.
      </p>

      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search procedures"
          placeholder="Search procedures…"
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
              Add procedure
            </Button>
          </div>
        ) : null}
      </header>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> procedures
        </div>

        {query.isPending ? (
          <TableLoading label="Loading procedures" />
        ) : query.isError ? (
          <TableError title="Could not load procedures" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          hasActiveSearch(search) ? (
            <TableEmpty
              title="No procedures match that search"
              description="Try a shorter term, or clear it."
              action={{
                label: 'Clear search',
                onClick: () => onSearchChange({ search: undefined }),
              }}
            />
          ) : (
            <TableEmpty
              title="No procedures yet"
              description={
                canManage
                  ? 'Add one, or import a list.'
                  : 'An administrator can add one for your organization.'
              }
            />
          )
        ) : (
          <>
            <ProceduresTable
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
        <NameDialog
          title={editing ? 'Rename procedure' : 'Add procedure'}
          description={
            editing
              ? 'The new name appears everywhere this procedure is listed.'
              : 'Visible to your organization only. A name already in the shared ' +
                'catalog counts as a duplicate.'
          }
          initialName={editing?.name ?? ''}
          isRename={editing !== null}
          onSave={(name) =>
            editing ? partialUpdateProcedure(editing.id, { name }) : createProcedure({ name })
          }
          invalidates={INVALIDATES}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          title={`Remove ${deleting.name}?`}
          description={
            'It stops appearing in your lists and pickers. Cases and quotes that already use it ' +
            'keep it, and it cannot be removed while any of them do.'
          }
          conflictCode="procedure_in_use"
          onDelete={() => deleteProcedure(deleting.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          title="Import procedures"
          description={
            <>
              A CSV or Excel file with a single column headed <strong>name</strong>. Names already
              available to you — your own or the shared catalog — are left alone, so the same file
              can be imported twice safely.
            </>
          }
          onImport={(file, dryRun) => importProcedures({ file, dry_run: dryRun })}
          onTemplate={() => procedureImportTemplate()}
          templateFilename="procedures_template.csv"
          invalidates={INVALIDATES}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}
