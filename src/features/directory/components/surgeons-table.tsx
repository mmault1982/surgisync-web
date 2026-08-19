import { PencilIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SurgeonCatalog } from '@/api/generated/model';
import { Button } from '@/components/ui/button';

/**
 * The surgeons table.
 *
 * Presentational: props only. A sibling of the other two directory tables
 * rather than a shared component — the columns are the payload, and this is
 * the first with two of them.
 *
 * Each column owns both its header and its cell renderer, because on the
 * on-hand screen those were once parallel arrays and swapping two `<td>`s
 * rendered the wrong field under the right header while passing every test.
 */
interface Column {
  key: string;
  label: string;
  headerClassName?: string;
  cell: (row: SurgeonCatalog) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Name',
    cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
  },
  {
    key: 'npi',
    label: 'NPI',
    headerClassName: 'w-40',
    // Shown as typed, not formatted. An NPI is an identifier people match
    // against a document by eye, so grouping the digits would make that harder.
    cell: (row) =>
      row.npi_number ? (
        <span className="font-mono text-gray-700">{row.npi_number}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function SurgeonsTable({
  rows,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: SurgeonCatalog[];
  canManage: boolean;
  onEdit: (surgeon: SurgeonCatalog) => void;
  onDelete: (surgeon: SurgeonCatalog) => void;
}) {
  return (
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
                <td key={column.key} className="px-4 py-3">
                  {column.cell(row)}
                </td>
              ))}
              {canManage ? (
                <td className="px-4 py-3 text-right">
                  {/* Owned rows only — the shared roster is refused by the
                      server, so offering the controls would only produce a
                      failure the user cannot act on. */}
                  {row.is_owned ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Amend ${row.name}`}
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
