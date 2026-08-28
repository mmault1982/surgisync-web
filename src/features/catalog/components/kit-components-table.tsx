import { Link } from '@tanstack/react-router';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { PartComponent } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { componentLabel } from '../kit-components';

/**
 * One kit's bill of materials.
 *
 * Presentational: props only, no hooks, no navigation and no data fetching —
 * `kit-components-card.tsx` owns the query and the dialogs, the same split
 * `product-catalog-screen.tsx` and `product-catalog-table.tsx` make.
 *
 * Hand-rolled `<table>` markup rather than `@tanstack/react-table`, which is a
 * dependency this project uses nowhere. No column menus either: this list is
 * short and the server groups it, so there is nothing to sort or filter by.
 */
interface Column {
  key: string;
  label: string;
  /** On the `<th>` only — this is where the column width lives. */
  headerClassName?: string;
  /** On the `<td>` only. */
  cellClassName?: string;
  cell: (row: PartComponent) => ReactNode;
}

/**
 * Each column owns both its header label and its cell renderer.
 *
 * Deliberately one array rather than parallel header and cell arrays: those
 * once rendered the wrong field under the right header while typechecking
 * perfectly, which is the note `product-catalog-table.tsx` carries.
 */
const COLUMNS: Column[] = [
  {
    key: 'description',
    label: 'Description',
    headerClassName: 'min-w-[260px]',
    cellClassName: 'font-medium text-gray-900',
    // `row.item`, not `row.id`. The first is the component part's own id and
    // the thing this link is about; the second identifies the junction row,
    // which is what Edit and Remove address. They are different numbers and
    // linking by the wrong one lands on an unrelated part — or, worse, on the
    // right one by coincidence while the fixture has them equal.
    cell: (row) => (
      <Link
        to="/inventory/product-catalog/$partId"
        params={{ partId: String(row.item) }}
        className="rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {componentLabel(row)}
      </Link>
    ),
  },
  {
    key: 'category',
    label: 'Category',
    headerClassName: 'w-[160px]',
    cellClassName: 'text-gray-800',
    // The component part's own category, which is what the catalog table and
    // the panel above show for the same part. The junction carries a `category`
    // column of its own that nothing has ever written; the server deliberately
    // does not publish it.
    cell: (row) => row.category || '—',
  },
  {
    key: 'reference_number',
    label: 'Reference #',
    headerClassName: 'w-[150px]',
    cellClassName: 'font-mono text-xs text-gray-800',
    // Null for a kit nested inside a kit — legal here, and the one row with no
    // catalog number. The em dash says "not applicable" rather than "missing".
    cell: (row) => row.reference_number || '—',
  },
  {
    key: 'quantity',
    label: 'Qty',
    headerClassName: 'w-[80px] text-right',
    cellClassName: 'text-right tabular-nums text-gray-900',
    cell: (row) => row.quantity,
  },
];

interface Props {
  rows: PartComponent[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  /** Called with the **component part's** id, not the BOM row's. */
  onOpenRow: (partId: number) => void;
  onEdit: (row: PartComponent) => void;
  onDelete: (row: PartComponent) => void;
}

export function KitComponentsTable({ rows, canManage, onOpenRow, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs tracking-wide text-gray-600 uppercase">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-3 py-2 font-semibold', column.headerClassName)}
              >
                {column.label}
              </th>
            ))}
            {canManage ? (
              <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">
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
              onOpen={() => onOpenRow(row.item)}
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
 * The whole row opens the component, but the Description cell's `<Link>` is
 * what carries the semantics — see the note on that column.
 *
 * The three click guards are lifted from `product-catalog-table.tsx`, which
 * lifted them from `on-hand-table.tsx`, and they hold for the same three
 * reasons there.
 */
function Row({
  row,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: PartComponent;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = componentLabel(row);

  return (
    <tr
      className="cursor-pointer border-b border-gray-100 even:bg-gray-50/60 last:border-0 hover:bg-gray-50"
      onClick={(event) => {
        // A modified click belongs to the Description link — new tab, new
        // window, add-to-selection.
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
            {/*
              "Edit quantity for X" rather than the house "Edit X", which the
              catalog and directory tables use. Those open a form over the whole
              record; this one changes a single number, and a label promising
              more than the dialog delivers is worse for a screen reader than an
              inconsistent one.
            */}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Edit quantity for ${label}`}
              onClick={onEdit}
            >
              <PencilIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${label} from this kit`}
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
