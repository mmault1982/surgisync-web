import type { ReactNode } from 'react';

import { KindEnum, type PartList } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { catalogLabel, type CatalogSearch } from '../catalog.search';
import { columnAriaSort, type ColumnKey } from '../columns';

import { CatalogColumnMenu } from './catalog-column-menu';

/**
 * The Product Catalog table.
 *
 * Presentational: props only, no hooks, no navigation and no data fetching.
 *
 * Hand-rolled `<table>` markup rather than `@tanstack/react-table`, which is a
 * dependency this project uses nowhere — the same call `manufacturers-table.tsx`
 * makes and for the same reason.
 */
interface Column {
  key: ColumnKey;
  label: string;
  /** On the `<th>` only — this is where the column width lives. */
  headerClassName?: string;
  /** On the `<td>` only. */
  cellClassName?: string;
  cell: (row: PartList) => ReactNode;
}

/**
 * Each column owns both its header label and its cell renderer.
 *
 * Deliberately one array rather than parallel header and cell arrays: those
 * once rendered the wrong field under the right header while typechecking
 * perfectly, which is the note `manufacturers-table.tsx` carries.
 */
const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Name',
    headerClassName: 'min-w-[280px]',
    cellClassName: 'font-medium text-gray-900',
    // Not `row.name`. Components carry a description and no name, so a literal
    // name column is blank for every one of them — see `catalogLabel`.
    cell: (row) => catalogLabel(row),
  },
  {
    key: 'manufacturer',
    label: 'Manufacturer',
    headerClassName: 'w-[200px]',
    cell: (row) => row.manufacturer_name,
  },
  {
    key: 'reference_number',
    label: 'Reference #',
    headerClassName: 'w-[160px]',
    cellClassName: 'font-mono text-xs text-gray-800',
    // Null for every kit — the catalog number is a scan target and kits have
    // none. The em dash says "not applicable" rather than "missing".
    cell: (row) => row.reference_number || '—',
  },
  {
    key: 'kind',
    label: 'Kind',
    headerClassName: 'w-[120px]',
    cell: (row) => <KindBadge kind={row.kind} />,
  },
];

interface Props {
  rows: PartList[];
  search: CatalogSearch;
  onSearchChange: (patch: Partial<CatalogSearch>) => void;
}

export function ProductCatalogTable({ rows, search, onSearchChange }: Props) {
  return (
    // Horizontal scroll on the wrapper, not the page. Note this also clips
    // vertically, which is why the column panels portal — see the note in
    // `catalog-column-menu.tsx`.
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs tracking-wide text-gray-600 uppercase">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={columnAriaSort(column.key, search)}
                className={cn('px-3 py-2 font-semibold', column.headerClassName)}
              >
                <CatalogColumnMenu
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
            <tr key={row.id} className="border-b border-gray-100 even:bg-gray-50/60 last:border-0">
              {COLUMNS.map((column) => (
                <td key={column.key} className={cn('px-3 py-2', column.cellClassName)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Kind as a pill, because it is a two-valued classification rather than a
 * value — the same reading the prototype gives its tinted status pills.
 */
function KindBadge({ kind }: { kind: KindEnum }) {
  const isKit = kind === KindEnum.kit;
  return (
    <Badge
      variant="secondary"
      className={cn(
        'font-medium',
        isKit ? 'bg-info-container text-info-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {isKit ? 'Kit' : 'Component'}
    </Badge>
  );
}
