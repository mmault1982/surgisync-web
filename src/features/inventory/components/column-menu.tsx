import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  ApiV1StockItemsListOrdering as Ordering,
  ApiV1StockItemsListOwnershipTypeItem as OwnershipType,
  ApiV1StockItemsListStatusItem as StatusLabel,
} from '@/api/generated/model';
import { cn } from '@/lib/utils';

import { facetQueries } from '../on-hand.queries';
import type { OnHandSearch } from '../on-hand.search';

export type ColumnKey =
  | 'kit_id'
  | 'part_name'
  | 'manufacturer'
  | 'ownership_type'
  | 'status'
  | 'transit'
  | 'assigned'
  | 'physical_location'
  | 'expiration'
  | 'last_seen';

/** Which ordering values a column sorts by, if any. */
const SORT_FIELD: Partial<Record<ColumnKey, keyof typeof Ordering>> = {
  kit_id: 'manufacturer_kit_id',
  part_name: 'part_name',
  manufacturer: 'manufacturer_name',
  ownership_type: 'ownership_type',
  status: 'is_complete',
  assigned: 'assigned_to_name',
  physical_location: 'physical_location',
  expiration: 'expiration_date',
  // `transit` and `last_seen` are absent on purpose: neither is sortable
  // server-side. Offering a control that silently does nothing is worse than
  // not offering it.
};

interface Props {
  columnKey: ColumnKey;
  label: string;
  search: OnHandSearch;
  onChange: (patch: Partial<OnHandSearch>) => void;
}

export function ColumnMenu({ columnKey, label, search, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      // The prototype has no keyboard dismissal at all.
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const sortField = SORT_FIELD[columnKey];
  const indicator = columnIndicator(columnKey, search, sortField);

  return (
    <div ref={container} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide hover:text-brand"
      >
        {label}
        {indicator && (
          <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
            {indicator}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-60 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          {sortField && <SortSection field={sortField} search={search} onChange={onChange} />}
          <FilterSection columnKey={columnKey} search={search} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/**
 * One glyph per column, showing filter count *and* sort direction.
 *
 * The prototype shows only one or the other — a column that is both filtered
 * and sorted hides its sort direction entirely — so this concatenates them.
 */
function columnIndicator(
  columnKey: ColumnKey,
  search: OnHandSearch,
  sortField: keyof typeof Ordering | undefined,
): string | null {
  const parts: string[] = [];
  const count = filterCount(columnKey, search);
  if (count) parts.push(String(count));
  if (sortField && search.ordering === sortField) parts.push('▲');
  if (sortField && search.ordering === `-${sortField}`) parts.push('▼');
  return parts.length ? parts.join(' ') : null;
}

function filterCount(columnKey: ColumnKey, search: OnHandSearch): number {
  switch (columnKey) {
    case 'kit_id':
      return search.manufacturer_kit_id_contains ? 1 : 0;
    case 'manufacturer':
      return search.manufacturer_id?.length ?? 0;
    case 'ownership_type':
      return search.ownership_type?.length ?? 0;
    case 'status':
      return search.status?.length ?? 0;
    case 'transit':
      return search.in_transit === undefined ? 0 : 1;
    case 'assigned':
      return search.assigned_to_representative?.length ?? 0;
    case 'physical_location':
      return search.physical_location?.length ?? 0;
    case 'expiration':
      return [
        search.expiration_date_after,
        search.expiration_date_before,
        search.has_expiration_date,
      ].filter((value) => value !== undefined).length;
    default:
      return 0;
  }
}

function SortSection({
  field,
  search,
  onChange,
}: {
  field: keyof typeof Ordering;
  search: OnHandSearch;
  onChange: (patch: Partial<OnHandSearch>) => void;
}) {
  const options = [
    { label: '↑ Asc', value: Ordering[field] },
    { label: '↓ Desc', value: Ordering[`-${field}` as keyof typeof Ordering] },
  ];

  return (
    <div className="mb-3">
      <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Sort</p>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange({ ordering: option.value })}
            className={cn(
              'flex-1 rounded border px-2 py-1 text-xs',
              search.ordering === option.value
                ? 'border-brand bg-brand text-white'
                : 'border-gray-200 hover:bg-gray-50',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterSection({
  columnKey,
  search,
  onChange,
}: {
  columnKey: ColumnKey;
  search: OnHandSearch;
  onChange: (patch: Partial<OnHandSearch>) => void;
}) {
  switch (columnKey) {
    case 'kit_id':
      return (
        <TextFilter
          value={search.manufacturer_kit_id_contains}
          onChange={(value) => onChange({ manufacturer_kit_id_contains: value })}
        />
      );
    case 'manufacturer':
      return <ManufacturerFilter search={search} onChange={onChange} />;
    case 'physical_location':
      return <LocationFilter search={search} onChange={onChange} />;
    case 'ownership_type':
      return (
        <Checklist
          options={Object.values(OwnershipType).map((value) => ({ value, label: value }))}
          selected={search.ownership_type ?? []}
          onToggle={(next) => onChange({ ownership_type: next.length ? next : undefined })}
        />
      );
    case 'status':
      return (
        <Checklist
          options={Object.values(StatusLabel).map((value) => ({
            value,
            label: value.replace(/_/g, ' '),
          }))}
          selected={search.status ?? []}
          onToggle={(next) => onChange({ status: next.length ? next : undefined })}
        />
      );
    case 'transit':
      return (
        <Radio
          value={search.in_transit}
          onChange={(value) => onChange({ in_transit: value })}
          options={[
            { label: 'Both', value: undefined },
            { label: 'In Transit', value: true },
            { label: 'Not In Transit', value: false },
          ]}
        />
      );
    case 'expiration':
      return <ExpirationFilter onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-gray-500">
          {columnKey === 'last_seen'
            ? 'Tracker state only — sorting and time filters need tracking data.'
            : 'No filter for this column.'}
        </p>
      );
  }
}

function TextFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
        Filter (contains)
      </span>
      <input
        type="text"
        defaultValue={value ?? ''}
        placeholder="Type to filter…"
        onChange={(event) => onChange(event.target.value.trim() || undefined)}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
    </label>
  );
}

function ManufacturerFilter({
  search,
  onChange,
}: {
  search: OnHandSearch;
  onChange: (patch: Partial<OnHandSearch>) => void;
}) {
  const { data, isPending } = useQuery(facetQueries.manufacturers());
  if (isPending) return <MenuLoading />;

  return (
    <Checklist
      options={(data?.results ?? []).map((row) => ({ value: row.id, label: row.name }))}
      selected={search.manufacturer_id ?? []}
      onToggle={(next) => onChange({ manufacturer_id: next.length ? next : undefined })}
    />
  );
}

function LocationFilter({
  search,
  onChange,
}: {
  search: OnHandSearch;
  onChange: (patch: Partial<OnHandSearch>) => void;
}) {
  const { data, isPending } = useQuery(facetQueries.physicalLocations());
  if (isPending) return <MenuLoading />;

  return (
    <Checklist
      options={(data?.results ?? []).map((value) => ({ value, label: value }))}
      selected={search.physical_location ?? []}
      onToggle={(next) => onChange({ physical_location: next.length ? next : undefined })}
    />
  );
}

function ExpirationFilter({ onChange }: { onChange: (patch: Partial<OnHandSearch>) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const inDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const presets = [
    {
      label: 'Expired',
      patch: {
        expiration_date_before: today,
        expiration_date_after: undefined,
        has_expiration_date: undefined,
      },
    },
    {
      label: 'Expiring 30d',
      patch: {
        expiration_date_after: today,
        expiration_date_before: inDays(30),
        has_expiration_date: undefined,
      },
    },
    {
      label: 'Expiring 60d',
      patch: {
        expiration_date_after: today,
        expiration_date_before: inDays(60),
        has_expiration_date: undefined,
      },
    },
    {
      label: 'Expiring 90d',
      patch: {
        expiration_date_after: today,
        expiration_date_before: inDays(90),
        has_expiration_date: undefined,
      },
    },
    {
      label: 'No Expiration',
      patch: {
        has_expiration_date: false,
        expiration_date_after: undefined,
        expiration_date_before: undefined,
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onChange(preset.patch)}
          className="rounded-full border border-gray-200 px-2 py-1 text-xs hover:border-brand hover:text-brand"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function Checklist<T extends string | number>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (next: T[]) => void;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-gray-500">No values in your inventory yet.</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={String(option.value)}
            className="flex cursor-pointer items-center gap-2 py-1 text-sm capitalize"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onToggle(
                  checked
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value],
                )
              }
              className="size-4 accent-brand"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function Radio({
  value,
  options,
  onChange,
}: {
  value: boolean | undefined;
  options: { label: string; value: boolean | undefined }[];
  onChange: (value: boolean | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((option) => (
        <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-brand"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function MenuLoading() {
  return <p className="text-xs text-gray-500">Loading options…</p>;
}
