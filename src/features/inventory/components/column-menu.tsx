import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import {
  ApiV1StockItemsListOrdering as Ordering,
  ApiV1StockItemsListOwnershipTypeItem as OwnershipType,
  ApiV1StockItemsListStatusItem as StatusLabel,
} from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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

  const sortField = SORT_FIELD[columnKey];
  const indicator = columnIndicator(columnKey, search, sortField);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase hover:text-primary"
        >
          {label}
          {indicator && <Badge className="h-4 px-1.5 text-[10px] font-bold">{indicator}</Badge>}
        </button>
      </PopoverTrigger>

      {/*
       * Portalled, which PopoverContent does by default — and that is
       * load-bearing, not incidental. The table sits in an `overflow-x-auto`
       * wrapper for horizontal scrolling, and per the CSS spec setting one
       * overflow axis to a non-visible value computes the other to `auto`. So
       * that container clips vertically too, and a panel rendered inline is cut
       * off by the table footer. No z-index fixes this: clipping is not a
       * stacking question. `e2e/on-hand.spec.ts` hit-tests the panel's bottom
       * edge to guard it.
       *
       * `collisionPadding` replaces the hand-rolled viewport clamping, and the
       * available-height variable replaces the hand-rolled max-height. Radix
       * also flips the panel above the trigger when there is no room below,
       * which the hand-rolled version never did.
       */}
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-60 gap-3 overflow-y-auto p-3"
      >
        {sortField && <SortSection field={sortField} search={search} onChange={onChange} />}
        <FilterSection columnKey={columnKey} search={search} onChange={onChange} />
      </PopoverContent>
    </Popover>
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

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-semibold text-muted-foreground uppercase">{children}</p>
  );
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
    <div>
      <MenuLabel>Sort</MenuLabel>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={search.ordering === option.value ? 'default' : 'outline'}
            onClick={() => onChange({ ordering: option.value })}
            className="flex-1"
          >
            {option.label}
          </Button>
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
        <TransitFilter
          value={search.in_transit}
          onChange={(value) => onChange({ in_transit: value })}
        />
      );
    case 'expiration':
      return <ExpirationFilter onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-muted-foreground">
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
  const id = useId();

  return (
    <div>
      <Label
        htmlFor={id}
        className="mb-1 text-[10px] font-semibold text-muted-foreground uppercase"
      >
        Filter (contains)
      </Label>
      <Input
        id={id}
        type="text"
        defaultValue={value ?? ''}
        placeholder="Type to filter…"
        onChange={(event) => onChange(event.target.value.trim() || undefined)}
      />
    </div>
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
        <Button
          key={preset.label}
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChange(preset.patch)}
          className="rounded-full"
        >
          {preset.label}
        </Button>
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
  const id = useId();

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No values in your inventory yet.</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        const optionId = `${id}-${String(option.value)}`;
        return (
          <div key={String(option.value)} className="flex items-center gap-2 py-1">
            <Checkbox
              id={optionId}
              checked={checked}
              onCheckedChange={() =>
                onToggle(
                  checked
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value],
                )
              }
            />
            <Label htmlFor={optionId} className="cursor-pointer text-sm font-normal capitalize">
              {option.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tri-state, so it cannot be a plain boolean.
 *
 * RadioGroup speaks strings, so the three states are encoded on the way in and
 * decoded on the way out rather than leaking a sentinel into the search schema.
 */
const TRANSIT_OPTIONS = [
  { label: 'Both', key: 'both', value: undefined },
  { label: 'In Transit', key: 'yes', value: true },
  { label: 'Not In Transit', key: 'no', value: false },
] as const;

function TransitFilter({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const id = useId();
  const current = TRANSIT_OPTIONS.find((option) => option.value === value) ?? TRANSIT_OPTIONS[0];

  return (
    <RadioGroup
      value={current.key}
      onValueChange={(key) => {
        const next = TRANSIT_OPTIONS.find((option) => option.key === key);
        if (next) onChange(next.value);
      }}
      className="gap-1"
    >
      {TRANSIT_OPTIONS.map((option) => {
        const optionId = `${id}-${option.key}`;
        return (
          <div key={option.key} className="flex items-center gap-2">
            <RadioGroupItem id={optionId} value={option.key} />
            <Label htmlFor={optionId} className="cursor-pointer text-sm font-normal">
              {option.label}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

function MenuLoading() {
  return <p className="text-xs text-muted-foreground">Loading options…</p>;
}
