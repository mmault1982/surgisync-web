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
    cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
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
  onEdit,
  onDelete,
}: {
  rows: Manufacturer[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
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
            <tr key={row.id} className="border-b border-gray-100 last:border-0">
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
                        aria-label={`Rename ${row.name}`}
                        onClick={() => onEdit(row)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${row.name}`}
                        onClick={() => onDelete(row)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
