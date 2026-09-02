import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  FunnelIcon,
  ListFilterIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { KindEnum, ListPartsOrdering as Ordering } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { catalogFacetQueries } from '../catalog.queries';
import type { CatalogSearch } from '../catalog.search';
import { SORT_FIELD, activeDirection, type AscendingOrdering, type ColumnKey } from '../columns';

export type { ColumnKey };

/**
 * The Product Catalog table's per-column sort and filter panel.
 *
 * A sibling of `features/inventory/components/column-menu.tsx` rather than a
 * generalization of it. That component is bound to `OnHandSearch`, on-hand's
 * `ColumnKey`, its `facetQueries` and its `SORT_FIELD` in four separate places;
 * making it generic over all four would be a larger and riskier change than the
 * four columns and two filter variants here justify. Same call
 * `procedures-table.tsx` records: the scaffolding is similar but the columns
 * are the payload.
 *
 * Every load-bearing decision that file documents is kept, and the two worth
 * repeating here because they look like style choices are the Popover and the
 * portal — see below.
 */
interface Props {
  columnKey: ColumnKey;
  label: string;
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
}

export function CatalogColumnMenu({ columnKey, label, search, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const sortField = SORT_FIELD[columnKey];
  // Both the indicator and the panel read this one call, so the header cannot
  // advertise a filter the panel does not offer.
  const filter = filterControl(columnKey, search, onChange);
  const count = filterCount(columnKey, search);

  return (
    /*
     * `Popover`, never `DropdownMenu`. The panel holds checkboxes, and
     * DropdownMenu implements typeahead that eats keystrokes meant for a
     * control while wanting `menuitem` semantics for its children. Popover
     * renders `role="dialog"`, which is what the tests match.
     */
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1.5 rounded-sm text-xs font-semibold tracking-wide uppercase hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {label}
          <ColumnIndicator
            search={search}
            sortField={sortField}
            filterable={filter !== null}
            filtered={count > 0}
          />
          {count > 0 && <Badge className="h-4 px-1.5 text-[10px] font-bold">{count}</Badge>}
        </button>
      </PopoverTrigger>

      {/*
       * Portalled, which PopoverContent does by default — and that is
       * load-bearing, not incidental. The table sits in an `overflow-x-auto`
       * wrapper for horizontal scrolling, and per the CSS spec setting one
       * overflow axis to a non-visible value computes the other to `auto`. So
       * that container clips vertically too, and a panel rendered inline is cut
       * off by the table footer. No z-index fixes this: clipping is not a
       * stacking question.
       *
       * `collisionPadding` keeps the panel on screen near the viewport edge,
       * and the available-height variable caps it; Radix flips it above the
       * trigger when there is no room below.
       */}
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-60 gap-3 overflow-y-auto p-3"
      >
        {sortField && <SortSection field={sortField} search={search} onChange={onChange} />}
        {filter ?? <p className="text-xs text-muted-foreground">No filter for this column.</p>}
      </PopoverContent>
    </Popover>
  );
}

/**
 * What a header is asking to be clicked for.
 *
 * At rest the icon names the column's capability, because it is not uniform
 * across the four: Manufacturer sorts and filters; Description and
 * Reference # only sort; and Kind only filters. Putting the same funnel on all
 * of them would promise Description a filter it does not have.
 *
 * Once a column is the active sort the glyph becomes the direction, and the
 * badge then carries only the count — the one thing an arrow cannot express.
 */
function ColumnIndicator({
  search,
  sortField,
  filterable,
  filtered,
}: {
  search: CatalogSearch;
  sortField: AscendingOrdering | undefined;
  filterable: boolean;
  filtered: boolean;
}) {
  const direction = activeDirection(sortField, search);

  const [Icon, state] = direction
    ? direction === 'ascending'
      ? ([ArrowUpIcon, 'sort-asc'] as const)
      : ([ArrowDownIcon, 'sort-desc'] as const)
    : sortField && filterable
      ? ([ListFilterIcon, 'sort-filter'] as const)
      : sortField
        ? ([ArrowUpDownIcon, 'sort'] as const)
        : filterable
          ? ([FunnelIcon, 'filter'] as const)
          : ([null, 'none'] as const);

  if (!Icon) return null;

  const active = direction !== undefined || filtered;

  return (
    <Icon
      // Kept out of the trigger's accessible name, which the tests match on
      // exactly.
      aria-hidden
      // Read by the unit tests, which would otherwise have to match on lucide's
      // own class names.
      data-column-indicator={state}
      className={cn(
        'size-3.5 shrink-0',
        // The prototype's .4 -> .9 -> 1 opacity ramp: a hint at rest, legible
        // on hover, unmissable once the column is actually doing something.
        active
          ? 'text-primary'
          : 'text-muted-foreground opacity-50 group-hover:opacity-100 group-data-[state=open]:opacity-100',
      )}
    />
  );
}

/**
 * How many values this column is currently filtered to.
 *
 * `kind` is scalar rather than a list, so it contributes 1 or 0 — a badge
 * reading "1" beside Kind means one of the two boxes is ticked.
 */
function filterCount(columnKey: ColumnKey, search: CatalogSearch): number {
  switch (columnKey) {
    case 'manufacturer':
      return search.manufacturer_id?.length ?? 0;
    case 'kind':
      return search.kind === undefined ? 0 : 1;
    default:
      return 0;
  }
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-semibold text-muted-foreground uppercase">{children}</p>
  );
}

function SortSection({
  field,
  search,
  onChange,
}: {
  field: AscendingOrdering;
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
}) {
  const options = [
    { label: '↑ Asc', value: Ordering[field] },
    { label: '↓ Desc', value: Ordering[`-${field}`] },
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

/**
 * The filter control for a column, or `null` where there is none.
 *
 * A plain function rather than a component on purpose: `CatalogColumnMenu`
 * needs to know whether a filter exists in order to pick the header icon, and
 * deriving that from the same switch that renders it is the only arrangement
 * where the two cannot drift. A parallel `FILTERABLE` set would compile fine
 * while quietly promising a filter this switch does not implement.
 *
 * Safe to call during render: every branch returns an element, and the hooks
 * live inside those child components, not here.
 */
function filterControl(
  columnKey: ColumnKey,
  search: CatalogSearch,
  onChange: (patch: Partial<CatalogSearch>) => void,
): ReactNode | null {
  switch (columnKey) {
    case 'manufacturer':
      return <ManufacturerFilter search={search} onChange={onChange} />;
    case 'kind':
      return <KindFilter search={search} onChange={onChange} />;
    default:
      return null;
  }
}

function ManufacturerFilter({
  search,
  onChange,
}: {
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
}) {
  const { data, isPending } = useQuery(catalogFacetQueries.manufacturers());
  if (isPending) return <MenuLoading />;

  return (
    <Checklist
      options={(data?.results ?? []).map((row) => ({ value: row.id, label: row.name }))}
      selected={search.manufacturer_id ?? []}
      onToggle={(next) => onChange({ manufacturer_id: next.length ? next : undefined })}
    />
  );
}

const KIND_LABELS: Record<KindEnum, string> = {
  [KindEnum.kit]: 'Kit',
  [KindEnum.component]: 'Component',
};

const KIND_VALUES = [KindEnum.kit, KindEnum.component];

/**
 * Two boxes over a scalar parameter.
 *
 * The endpoint takes one `kind` and the vocabulary has exactly two values, so
 * ticking both asks the same question as ticking neither — "show me
 * everything" — and both collapse to `undefined` rather than to a value that
 * would hide half the catalog. Unset therefore renders as *both* boxes checked,
 * so "no filter" reads as "both kinds shown" rather than as an empty control
 * nobody has touched yet.
 *
 * A `Checklist` rather than the tri-state `RadioGroup` the on-hand Transit
 * column uses: this reads as narrowing a set, which is what every other column
 * menu in the app does, and it keeps the badge meaning the same thing here as
 * beside Manufacturer.
 */
function KindFilter({
  search,
  onChange,
}: {
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
}) {
  const selected = search.kind ? [search.kind] : KIND_VALUES;

  return (
    <Checklist
      options={KIND_VALUES.map((value) => ({ value, label: KIND_LABELS[value] }))}
      selected={selected}
      onToggle={(next) => onChange({ kind: next.length === 1 ? next[0] : undefined })}
    />
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
    return <p className="text-xs text-muted-foreground">No values in your catalog yet.</p>;
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
            {/* `htmlFor` is what makes clicking the text toggle the box, which
                is what a pointer actually aims at. Asserted by a unit test. */}
            <Label htmlFor={optionId} className="cursor-pointer text-sm font-normal">
              {option.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

function MenuLoading() {
  return <p className="text-xs text-muted-foreground">Loading options…</p>;
}
