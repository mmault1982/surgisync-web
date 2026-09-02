import { Link } from '@tanstack/react-router';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

import { KindEnum, type PartList } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    key: 'description',
    label: 'Description',
    headerClassName: 'min-w-[280px]',
    cellClassName: 'font-medium text-gray-900',
    // A real anchor, not just the row's click handler. It is the keyboard path
    // (a tabbable `<tr>` would make every row a tab stop and wreck the table's
    // row/gridcell semantics), it gives cmd-click and "open in new tab", and
    // `defaultPreload: 'intent'` prefetches the detail route on hover. Same
    // call the on-hand table's Kit ID column makes.
    //
    // The label is `catalogLabel(row)`, not `row.name` — that one is the
    // deprecated alias of this column.
    cell: (row) => (
      <Link
        to="/inventory/product-catalog/$partId"
        params={{ partId: String(row.id) }}
        className="rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {catalogLabel(row)}
      </Link>
    ),
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
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  onOpenRow: (id: number) => void;
  onEdit: (row: PartList) => void;
  onDelete: (row: PartList) => void;
}

export function ProductCatalogTable({
  rows,
  search,
  onSearchChange,
  canManage,
  onOpenRow,
  onEdit,
  onDelete,
}: Props) {
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
            {canManage ? (
              // The only plain-label header on this table — every other one
              // holds a column menu, and there is nothing to sort or filter
              // a pair of buttons by.
              <th scope="col" className="w-28 px-3 py-2 text-right font-semibold">
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
              onOpen={() => onOpenRow(row.id)}
              onEdit={() => onEdit(row)}
              onDelete={() => onDelete(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The whole row opens the part, but the Name cell's `<Link>` is what carries
 * the semantics — see the note on that column.
 *
 * Deliberately no `tabIndex` or `role="button"` here: that would make every
 * row a tab stop and replace the `row`/`gridcell` roles a screen reader
 * navigates the table with. Deliberately not a stretched-link overlay either —
 * one sits above every cell and makes text selection impossible, and people
 * copy catalog numbers out of these rows. Lifted from `on-hand-table.tsx`,
 * which carries the same three guards for the same three reasons.
 */
function Row({
  row,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: PartList;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = catalogLabel(row);

  return (
    <tr
      className="cursor-pointer border-b border-gray-100 even:bg-gray-50/60 last:border-0 hover:bg-gray-50"
      onClick={(event) => {
        // A modified click belongs to the Name link — new tab, new window,
        // add-to-selection. Navigating programmatically would swallow the
        // modifier and do the one thing the user did not ask for.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Anything interactive in the row owns its own click — which is what
        // keeps Edit and Remove from also opening the part behind their dialog.
        if (event.target instanceof Element && event.target.closest('a,button,input,label')) return;
        // Dragging across a catalog number to copy it should not navigate away
        // from it. `=== false` rather than `!`, because getSelection() can be
        // null and `!undefined` would swallow every click.
        if (window.getSelection()?.isCollapsed === false) return;
        onOpen();
      }}
    >
      {COLUMNS.map((column) => (
        <td key={column.key} className={cn('px-3 py-2', column.cellClassName)}>
          {column.cell(row)}
        </td>
      ))}
      {canManage ? (
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Edit ${label}`}
              onClick={onEdit}
            >
              <PencilIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${label}`}
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
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
