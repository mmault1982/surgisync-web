import {
  FILTERABLE_COLUMNS,
  activeFilterKeys,
  type CatalogSearch,
  type FilterKey,
} from '../catalog.search';

/**
 * One chip per active filter, each clearing only itself.
 *
 * A sibling of `features/inventory/components/active-filter-chips.tsx` for the
 * same reason `catalog-column-menu.tsx` is a sibling of its on-hand
 * counterpart: that one is typed against `OnHandSearch` throughout, and this
 * screen has two filters rather than eleven.
 *
 * Note the chip clears the filter and leaves the sort alone. The prototype
 * clears the whole column, which is more than the chip claims to do.
 */
export function CatalogFilterChips({
  search,
  onChange,
  onClearAll,
}: {
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
  onClearAll: () => void;
}) {
  const keys = activeFilterKeys(search);
  if (keys.length === 0 && !search.search) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-container bg-accent px-3 py-2">
      <span className="text-[11px] font-bold tracking-wide text-brand uppercase">
        Active filters
      </span>

      {search.search && (
        <Chip
          label={`Search: "${search.search}"`}
          onRemove={() => onChange({ search: undefined })}
        />
      )}

      {keys.map((key) => (
        <Chip
          key={key}
          label={`${FILTERABLE_COLUMNS[key]}: ${describe(key, search)}`}
          onRemove={() => onChange({ [key]: undefined })}
        />
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto rounded-full border border-brand px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand hover:text-white"
      >
        Clear all
      </button>
    </div>
  );
}

function describe(key: FilterKey, search: CatalogSearch): string {
  const value = search[key];
  // Manufacturer is a list and Kind is a scalar, so the chip says "2 selected"
  // for one and names the value for the other. Naming two manufacturers would
  // not fit; naming the one kind is more useful than "1 selected".
  if (Array.isArray(value)) return `${value.length} selected`;
  return String(value);
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-white px-2.5 py-1 text-xs text-brand">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`}>
        ✕
      </button>
    </span>
  );
}
