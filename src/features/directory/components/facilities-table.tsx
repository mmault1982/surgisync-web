import { Link } from '@tanstack/react-router';
import { PencilIcon, PowerIcon, RotateCcwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { FacilityCatalog } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { FACILITY_TYPE_LABELS } from '../facility-labels';

/**
 * The facilities table.
 *
 * Presentational: props only, no hooks and no navigation, the same split every
 * component on Manage On-Hand makes.
 *
 * Hand-rolled `<table>` markup rather than `@tanstack/react-table`, which is a
 * dependency this project uses nowhere. Each column owns **both** its header
 * and its cell renderer, because on the on-hand screen those were once two
 * parallel arrays and swapping two `<td>`s rendered the wrong field under the
 * right header while passing `tsc`, lint and every test.
 *
 * ## Deactivated rows are listed, not hidden
 *
 * The endpoint returns active and deactivated facilities together unless asked
 * otherwise, and that is deliberate on its side: a deactivation is a state to
 * show and undo, not a removal. So this table has to say which is which. The
 * marker is a badge **inside the Name cell** rather than a column of its own —
 * it qualifies the row's identity rather than being a field of it, and a
 * column that is blank for almost every row earns less than the width it
 * costs.
 */
interface Column {
  key: string;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: FacilityCatalog) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Name',
    /*
      A real anchor, not just the row's click handler. It is the keyboard path,
      it gives cmd-click and "open in new tab", and it is what
      `defaultPreload: 'intent'` prefetches from. Lifted from
      `manufacturers-table.tsx`, which carries the same note.
    */
    cell: (row) => (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/directory/facilities/$facilityId"
          params={{ facilityId: String(row.id) }}
          className="font-medium text-gray-900 hover:text-primary hover:underline"
        >
          {row.name}
        </Link>
        {/*
          `is_active === false`, not `!row.is_active`: the field is optional on
          the read schema, and an omitted flag must not read as stood down.
        */}
        {row.is_active === false ? <Badge variant="outline">Deactivated</Badge> : null}
      </div>
    ),
  },
  {
    key: 'facility_type',
    label: 'Type',
    headerClassName: 'w-56',
    cell: (row) =>
      row.facility_type ? (
        FACILITY_TYPE_LABELS[row.facility_type]
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function FacilitiesTable({
  rows,
  canManage,
  busyId,
  onOpenRow,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  rows: FacilityCatalog[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  /**
   * The row with a reactivation in flight, if any. Reactivation has no dialog
   * to hold a spinner, so the row's own control is where "working" has to
   * show — and disabling it is what stops a double click sending the PATCH
   * twice.
   */
  busyId: number | null;
  onOpenRow: (facility: FacilityCatalog) => void;
  onEdit: (facility: FacilityCatalog) => void;
  onDeactivate: (facility: FacilityCatalog) => void;
  onReactivate: (facility: FacilityCatalog) => void;
}) {
  return (
    // Horizontal scroll on the wrapper, not the page: the sidebar and header
    // must not move when a narrow window meets a wide table.
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-2 font-medium text-gray-700 ${column.headerClassName ?? ''}`}
              >
                {column.label}
              </th>
            ))}
            {canManage ? (
              <th scope="col" className="w-28 px-4 py-2 text-right font-medium text-gray-700">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              canManage={canManage}
              busy={busyId === row.id}
              onOpen={() => onOpenRow(row)}
              onEdit={() => onEdit(row)}
              onDeactivate={() => onDeactivate(row)}
              onReactivate={() => onReactivate(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The whole row opens the facility, but the Name cell's `<Link>` is what
 * carries the semantics — see the note on that column.
 *
 * Deliberately no `tabIndex` or `role="button"` here: that would make every row
 * a tab stop and replace the `row`/`gridcell` roles a screen reader navigates
 * the table with. Deliberately not a stretched-link overlay either — one sits
 * above every cell and makes text selection impossible. Lifted from
 * `manufacturers-table.tsx`, which carries the same three guards for the same
 * three reasons.
 */
function Row({
  row,
  canManage,
  busy,
  onOpen,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  row: FacilityCatalog;
  canManage: boolean;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const deactivated = row.is_active === false;

  return (
    <tr
      className={cn(
        'cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50',
        // A second, non-colour-only signal beside the badge. The badge is the
        // one that carries the meaning; this just stops a stood-down row
        // reading as loudly as a live one.
        deactivated && 'text-muted-foreground',
      )}
      onClick={(event) => {
        // A modified click belongs to the Name link — new tab, new window,
        // add-to-selection. Navigating programmatically would swallow the
        // modifier and do the one thing the user did not ask for.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Anything interactive in the row owns its own click — which is what
        // keeps Edit and Deactivate from also opening the record behind their
        // dialog.
        if (event.target instanceof Element && event.target.closest('a,button,input,label')) return;
        // Dragging across a name to copy it should not navigate away from it.
        // `=== false` rather than `!`, because getSelection() can be null and
        // `!undefined` would swallow every click.
        if (window.getSelection()?.isCollapsed === false) return;
        onOpen();
      }}
    >
      {COLUMNS.map((column) => (
        <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ''}`}>
          {column.cell(row)}
        </td>
      ))}
      {canManage ? (
        <td className="px-4 py-3 text-right">
          {/*
            Owned rows only. Every facility has exactly one owner since the
            backend's migration 0132, so this is true for almost every row —
            but it does not collapse to a constant: a superuser, or a user
            holding several memberships, reads rows that writes would 404 on.
          */}
          {row.is_owned ? (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Edit ${row.name}`}
                onClick={onEdit}
              >
                <PencilIcon />
              </Button>
              {deactivated ? (
                // No confirmation: reactivating is not destructive, it is the
                // undo of something the user was already warned about, and the
                // badge clearing is the success signal. There is no toast in
                // this app.
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Reactivate ${row.name}`}
                  disabled={busy}
                  onClick={onReactivate}
                >
                  <RotateCcwIcon />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  // "Deactivate", never "Remove": this DELETE stands the row
                  // down and leaves it here, holding its name.
                  aria-label={`Deactivate ${row.name}`}
                  onClick={onDeactivate}
                >
                  <PowerIcon />
                </Button>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Read only</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}
