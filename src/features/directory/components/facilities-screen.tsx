import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import {
  deactivateFacility,
  partialUpdateFacility,
} from '@/api/generated/endpoints/inventory/inventory';
import type { FacilityCatalog, FacilityTypeEnum } from '@/api/generated/model';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { DeleteDialog } from '@/components/delete-dialog';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { transferKeys } from '@/features/inventory/inventory.keys';

import { facilityKeys } from '../directory.keys';
import { facilityListQuery } from '../facilities.queries';
import { hasActiveFilters, type FacilitySearch } from '../facilities.search';
import { FACILITY_TYPES, FACILITY_TYPE_LABELS } from '../facility-labels';

import { FacilitiesTable } from './facilities-table';

/**
 * Facilities, under Directory Profiles.
 *
 * Every facility belongs to exactly one organization — there is no shared
 * directory here, unlike manufacturers — so `is_owned` is true for almost
 * every row. It still gates the write controls, because a superuser or a user
 * holding several memberships reads rows that writes would 404 on.
 */

/**
 * The two query roots every facility write refreshes.
 *
 * `facilityKeys` is this table. `transferKeys.targets()` is the Kit Detail
 * Transfer dialog's destination picker, which is **not** obvious from here:
 * that endpoint builds its facility half from
 * `Facility.objects.filter(is_active=True)`, so a deactivation takes a row out
 * of it, a reactivation puts it back, and a rename relabels it. Without this,
 * a facility stood down here would go on being offered as a transfer
 * destination until something else happened to evict the cache.
 */
const INVALIDATES = [facilityKeys.all, transferKeys.targets()] as const;

/** The `is_active` filter, as three URL states. */
const STATE_OPTIONS = [
  { value: 'all', label: 'All facilities', is_active: undefined },
  { value: 'active', label: 'Active only', is_active: true },
  { value: 'deactivated', label: 'Deactivated only', is_active: false },
] as const;

/** The sentinel a `Select` needs, because Radix cannot hold `''` as an item value. */
const ANY = '__any__';

export function FacilitiesScreen({
  search,
  onSearchChange,
  onPageChange,
  onAdd,
  onOpen,
  onEdit,
}: {
  search: FacilitySearch;
  onSearchChange: (patch: Partial<FacilitySearch>) => void;
  onPageChange: (page: number) => void;
  /** Add and Edit are pages, not dialogs — this form has twenty-five fields. */
  onAdd: () => void;
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const query = useQuery(facilityListQuery(search));
  const queryClient = useQueryClient();
  // Writes are org-admin only server-side. Offering the controls to everyone
  // would mean a rep fills in the form and learns on submit.
  const canManage = canManageOrgRecords(useAuth().user?.role);

  const [deactivating, setDeactivating] = useState<FacilityCatalog | null>(null);

  const reactivate = useMutation({
    // A write is not something to re-send blind, and this one is a state
    // change the user would have no way of knowing had happened twice.
    retry: false,
    mutationFn: (facility: FacilityCatalog) =>
      partialUpdateFacility(facility.id, { is_active: true }),
    onSuccess: async () => {
      await Promise.all(INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const rows = query.data?.results ?? [];
  const stateOption =
    STATE_OPTIONS.find((option) => option.is_active === search.is_active) ?? STATE_OPTIONS[0];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Facilities</h1>
      {/*
        Said plainly, because the alternative is discovering it by not finding
        a facility you know exists. Deactivated rows are listed here by
        default — this is the catalog that exists to show and undo that state,
        not the picker that hides it.
      */}
      <p className="mb-4 text-sm text-muted-foreground">
        The hospitals, surgery centres and clinics your organization deals with. Deactivated
        facilities are listed here too — they keep their name and everything already pointing at
        them, and they can be brought back.
      </p>

      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search facilities"
          placeholder="Search facilities…"
          defaultValue={search.search ?? ''}
          onChange={(event) => onSearchChange({ search: event.target.value.trim() || undefined })}
          className="min-w-64 max-w-sm"
        />

        <Select
          value={search.facility_type ?? ANY}
          onValueChange={(next) =>
            onSearchChange({
              facility_type: next === ANY ? undefined : (next as FacilityTypeEnum),
            })
          }
        >
          <SelectTrigger className="w-56" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All types</SelectItem>
            {FACILITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {FACILITY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={stateOption.value}
          onValueChange={(next) =>
            onSearchChange({
              is_active: STATE_OPTIONS.find((option) => option.value === next)?.is_active,
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/*
          No Import button. The other three directory entities have an import
          endpoint and a template; this one has neither, and that is the
          contract's answer rather than an omission to fill in later.
        */}
        {canManage ? (
          <Button type="button" className="ml-auto" onClick={onAdd}>
            <PlusIcon />
            Add facility
          </Button>
        ) : null}
      </header>

      {/*
        Reactivation has no dialog of its own, so a failure has nowhere else to
        land. Above the table rather than in the row: the row it belongs to may
        have moved by the time the list refetches.
      */}
      {reactivate.isError ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Could not reactivate that facility. {errorMessage(reactivate.error)}
        </p>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <strong>{query.data?.total_data ?? 0}</strong> facilities
        </div>

        {query.isPending ? (
          <TableLoading label="Loading facilities" />
        ) : query.isError ? (
          <TableError title="Could not load facilities" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          hasActiveFilters(search) ? (
            <TableEmpty
              title="No facilities match those filters"
              description="Try a shorter search term, or widen the filters."
              action={{
                label: 'Clear filters',
                onClick: () =>
                  onSearchChange({
                    search: undefined,
                    facility_type: undefined,
                    is_active: undefined,
                  }),
              }}
            />
          ) : (
            <TableEmpty
              title="No facilities yet"
              description={
                canManage
                  ? 'Add one to start recording cases and stock against it.'
                  : 'An administrator can add one for your organization.'
              }
            />
          )
        ) : (
          <>
            <FacilitiesTable
              rows={rows}
              canManage={canManage}
              busyId={reactivate.isPending ? (reactivate.variables?.id ?? null) : null}
              onOpenRow={(row) => onOpen(row.id)}
              onEdit={(row) => onEdit(row.id)}
              onDeactivate={setDeactivating}
              onReactivate={(row) => reactivate.mutate(row)}
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

      {deactivating ? (
        // No `conflictCode`: the endpoint documents no 409, deliberately.
        // Nothing is hidden and nothing is freed by this write, so there is no
        // reference for one to protect — and a guard on "has cases" would
        // refuse essentially every real facility, which is exactly the set an
        // operator needs to stand down.
        <DeleteDialog
          title={`Deactivate ${deactivating.name}?`}
          description={
            'It stops appearing in case, quote and transfer destination pickers, and anyone whose ' +
            'only facility assignment is this one will see an empty picker. Cases, quotes, price ' +
            'files and stock already pointing at it keep resolving, and it keeps its name — so ' +
            'the name is not freed for another facility. You can reactivate it from this list.'
          }
          confirmLabel="Deactivate"
          pendingLabel="Deactivating"
          onDelete={() => deactivateFacility(deactivating.id)}
          invalidates={INVALIDATES}
          onClose={() => setDeactivating(null)}
        />
      ) : null}
    </div>
  );
}
