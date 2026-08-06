import type { ReactNode } from 'react';

import type { InventoryKitList } from '@/api/generated/model';
import { cn } from '@/lib/utils';

import { STRIPE_CLASSES, isExpired, statusLabels, stripeTone, trackerState } from '../stock-status';
import type { OnHandSearch } from '../on-hand.search';
import { ColumnMenu, type ColumnKey } from './column-menu';

interface Props {
  rows: InventoryKitList[];
  search: OnHandSearch;
  selected: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onSearchChange: (patch: Partial<OnHandSearch>) => void;
}

/**
 * One entry per column, carrying its own cell renderer.
 *
 * The header list and the cell markup used to be two parallel arrays kept in
 * the same order by nothing but care. Swapping two `<td>`s rendered the wrong
 * field under the right header and still passed `tsc`, lint and every unit
 * test — only one e2e assertion, on one column, could catch it. Declaring the
 * cell alongside the header makes that class of mistake unrepresentable, and
 * `cell` receives a typed row so the field access is checked.
 *
 * The row checkbox is deliberately not a column: it is the same cell in every
 * table, carries the status stripe, and needs selection state the others do not.
 */
interface Column {
  key: ColumnKey;
  label: string;
  /** On the `<th>` only — this is where the column width lives. */
  headerClassName?: string;
  /** On the `<td>` only. */
  cellClassName?: string;
  cell: (row: InventoryKitList) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'kit_id',
    label: 'Kit ID',
    headerClassName: 'w-[150px] font-mono text-xs font-semibold',
    cellClassName: 'font-mono text-xs font-semibold text-gray-800',
    cell: (row) => row.manufacturer_kit_id || '—',
  },
  {
    key: 'part_name',
    label: 'Kit Name',
    headerClassName: 'w-[190px]',
    cell: (row) => row.part_name,
  },
  {
    key: 'manufacturer',
    label: 'Manufacturer',
    headerClassName: 'w-[130px]',
    cell: (row) => row.manufacturer_name,
  },
  {
    key: 'ownership_type',
    label: 'Type',
    headerClassName: 'w-[110px]',
    cellClassName: 'capitalize',
    cell: (row) => row.ownership_type,
  },
  {
    key: 'status',
    label: 'Status',
    headerClassName: 'w-[160px]',
    cell: (row) => statusLabels(row).join(' · '),
  },
  {
    key: 'transit',
    label: 'Transit',
    headerClassName: 'w-[130px]',
    cell: (row) =>
      row.active_transfer_id !== null ? (
        <span title={row.active_transfer_destination_name ?? undefined}>In Transit</span>
      ) : (
        '—'
      ),
  },
  {
    key: 'assigned',
    label: 'Rep / Assigned To',
    headerClassName: 'w-[170px]',
    cell: (row) => row.assigned_to_name ?? row.assigned_to_facility_name ?? '—',
  },
  {
    key: 'physical_location',
    label: 'Physical Location',
    headerClassName: 'w-[160px]',
    cell: (row) => row.physical_location || '—',
  },
  {
    key: 'expiration',
    label: 'Expiration',
    headerClassName: 'w-[120px]',
    cell: (row) =>
      row.expiration_date ? (
        <span
          className={cn(
            isExpired(row) &&
              'rounded-xl bg-brand-container px-2 py-0.5 text-xs font-semibold text-primary',
          )}
        >
          {row.expiration_date}
        </span>
      ) : (
        '—'
      ),
  },
  {
    key: 'last_seen',
    label: 'Last Seen',
    headerClassName: 'w-[130px]',
    cellClassName: 'text-xs',
    // Tracker state only — no timestamp exists yet. The cell upgrades in place
    // when the tracking work lands.
    cell: (row) => {
      switch (trackerState(row)) {
        case 'tracked':
          return <span className="font-medium text-green-700">Tracked</span>;
        case 'pairing':
          return <span className="font-medium text-amber-700 italic">Pairing</span>;
        case 'untracked':
          return <span className="text-gray-400">—</span>;
      }
    },
  },
];

export function OnHandTable({
  rows,
  search,
  selected,
  onToggleRow,
  onToggleAll,
  onSearchChange,
}: Props) {
  // Scoped to the rows actually on screen. The prototype's header checkbox
  // iterates every row rather than the filtered set, so with a filter applied
  // it silently selects rows the user cannot see and never appears checked.
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someVisibleSelected = rows.some((row) => selected.has(row.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs tracking-wide text-gray-600 uppercase">
            <th className="w-11 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all rows on this page"
                checked={allVisibleSelected}
                ref={(node) => {
                  // Indeterminate cannot be expressed in JSX; the prototype has
                  // no partial state at all, so a part-selected page looked
                  // identical to an empty one.
                  if (node) node.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={onToggleAll}
                className="accent-brand size-4"
              />
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn('px-3 py-2 font-semibold', column.headerClassName)}
              >
                <ColumnMenu
                  columnKey={column.key}
                  label={column.label}
                  search={search}
                  onChange={onSearchChange}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              onToggle={() => onToggleRow(row.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  selected,
  onToggle,
}: {
  row: InventoryKitList;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="relative border-b border-gray-100 even:bg-gray-50/60 hover:bg-gray-50">
      <td className="relative w-11 px-3 py-2">
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-[3px]', STRIPE_CLASSES[stripeTone(row)])}
        />
        <input
          type="checkbox"
          aria-label={`Select ${row.part_name}`}
          checked={selected}
          onChange={onToggle}
          className="accent-brand size-4"
        />
      </td>
      {COLUMNS.map((column) => (
        <td key={column.key} className={cn('px-3 py-2', column.cellClassName)}>
          {column.cell(row)}
        </td>
      ))}
    </tr>
  );
}
