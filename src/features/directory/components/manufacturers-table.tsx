import { Link } from '@tanstack/react-router';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Manufacturer } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * The manufacturers table.
 *
 * Presentational: props only, no hooks and no navigation, the same split every
 * component on Manage On-Hand makes.
 *
 * Hand-rolled `<table>` markup rather than `@tanstack/react-table`, which is a
 * dependency this project uses nowhere. Each column owns **both** its header
 * and its cell renderer, because on the on-hand screen those were once two
 * parallel arrays and swapping two `<td>`s rendered the wrong field under the
 * right header while passing `tsc`, lint and every test.
 */
interface Column {
  key: string;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: Manufacturer) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Name',
    /*
      A real anchor, not just the row's click handler. It is the keyboard path,
      it gives cmd-click and "open in new tab", and it is what
      `defaultPreload: 'intent'` prefetches from. Lifted from
      `product-catalog-table.tsx`, which carries the same note.
    */
    cell: (row) => (
      <Link
        to="/directory/manufacturers/$manufacturerId"
        params={{ manufacturerId: String(row.id) }}
        className="font-medium text-gray-900 hover:text-primary hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: 'barcode',
    label: 'Barcode',
    headerClassName: 'w-32',
    // Whether one exists, not the image. The barcode encodes the name and is
    // generated server-side, so it is a health signal here rather than
    // something to look at — a row without one is a row something skipped.
    cell: (row) =>
      row.barcode ? (
        <Badge variant="secondary">Generated</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function ManufacturersTable({
  rows,
  canManage,
  onOpenRow,
  onEdit,
  onDelete,
}: {
  rows: Manufacturer[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  onOpenRow: (manufacturer: Manufacturer) => void;
  onEdit: (manufacturer: Manufacturer) => void;
  onDelete: (manufacturer: Manufacturer) => void;
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
              onOpen={() => onOpenRow(row)}
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
 * The whole row opens the manufacturer, but the Name cell's `<Link>` is what
 * carries the semantics — see the note on that column.
 *
 * Deliberately no `tabIndex` or `role="button"` here: that would make every row
 * a tab stop and replace the `row`/`gridcell` roles a screen reader navigates
 * the table with. Deliberately not a stretched-link overlay either — one sits
 * above every cell and makes text selection impossible. Lifted from
 * `product-catalog-table.tsx`, which carries the same three guards for the same
 * three reasons.
 */
function Row({
  row,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: Manufacturer;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
      onClick={(event) => {
        // A modified click belongs to the Name link — new tab, new window,
        // add-to-selection. Navigating programmatically would swallow the
        // modifier and do the one thing the user did not ask for.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Anything interactive in the row owns its own click — which is what
        // keeps Edit and Remove from also opening the record behind their
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
          {/* Owned rows only — see procedures-table.tsx. */}
          {row.is_owned ? (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                // "Edit", not "Rename": it opens a form with eleven fields now,
                // of which the name is one.
                aria-label={`Edit ${row.name}`}
                onClick={onEdit}
              >
                <PencilIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${row.name}`}
                onClick={onDelete}
              >
                <Trash2Icon />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Shared</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}
