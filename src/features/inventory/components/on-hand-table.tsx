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

const COLUMNS: { key: ColumnKey; label: string; className: string }[] = [
  { key: 'kit_id', label: 'Kit ID', className: 'w-[150px] font-mono text-xs font-semibold' },
  { key: 'part_name', label: 'Kit Name', className: 'w-[190px]' },
  { key: 'manufacturer', label: 'Manufacturer', className: 'w-[130px]' },
  { key: 'ownership_type', label: 'Type', className: 'w-[110px]' },
  { key: 'status', label: 'Status', className: 'w-[160px]' },
  { key: 'transit', label: 'Transit', className: 'w-[130px]' },
  { key: 'assigned', label: 'Rep / Assigned To', className: 'w-[170px]' },
  { key: 'physical_location', label: 'Physical Location', className: 'w-[160px]' },
  { key: 'expiration', label: 'Expiration', className: 'w-[120px]' },
  { key: 'last_seen', label: 'Last Seen', className: 'w-[130px]' },
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
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
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
                className="size-4 accent-brand"
              />
            </th>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn('px-3 py-2 font-semibold', column.className)}>
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
  const tone = stripeTone(row);
  const expired = isExpired(row);
  const tracker = trackerState(row);

  return (
    <tr className="relative border-b border-gray-100 even:bg-gray-50/60 hover:bg-gray-50">
      <td className="relative w-11 px-3 py-2">
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-[3px]', STRIPE_CLASSES[tone])}
        />
        <input
          type="checkbox"
          aria-label={`Select ${row.part_name}`}
          checked={selected}
          onChange={onToggle}
          className="size-4 accent-brand"
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800">
        {row.manufacturer_kit_id || '—'}
      </td>
      <td className="px-3 py-2">{row.part_name}</td>
      <td className="px-3 py-2">{row.manufacturer_name}</td>
      <td className="px-3 py-2 capitalize">{row.ownership_type}</td>
      <td className="px-3 py-2">{statusLabels(row).join(' · ')}</td>
      <td className="px-3 py-2">
        {row.active_transfer_id !== null ? (
          <span title={row.active_transfer_destination_name ?? undefined}>In Transit</span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2">{row.assigned_to_name ?? row.assigned_to_facility_name ?? '—'}</td>
      <td className="px-3 py-2">{row.physical_location || '—'}</td>
      <td className="px-3 py-2">
        {row.expiration_date ? (
          <span
            className={cn(
              expired &&
                'rounded-xl bg-brand-container px-2 py-0.5 text-xs font-semibold text-primary',
            )}
          >
            {row.expiration_date}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {/* Tracker state only — no timestamp exists yet. The cell upgrades in
            place when the tracking work lands. */}
        {tracker === 'tracked' && <span className="font-medium text-green-700">Tracked</span>}
        {tracker === 'pairing' && (
          <span className="font-medium text-amber-700 italic">Pairing</span>
        )}
        {tracker === 'untracked' && <span className="text-gray-400">—</span>}
      </td>
    </tr>
  );
}
