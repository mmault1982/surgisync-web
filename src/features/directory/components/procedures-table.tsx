import { PencilIcon, Trash2Icon } from 'lucide-react';

import type { ProcedureCatalog } from '@/api/generated/model';
import { Button } from '@/components/ui/button';

/**
 * The procedures table.
 *
 * Presentational: props only, no hooks and no navigation.
 *
 * A sibling of `manufacturers-table.tsx` rather than a shared component. The
 * scaffolding is similar but the columns are the payload, and a table that
 * takes its columns as a prop is a table nobody can read to find out what it
 * shows. Procedures has one column; manufacturers has two and a Barcode badge.
 */
export function ProceduresTable({
  rows,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: ProcedureCatalog[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  onEdit: (procedure: ProcedureCatalog) => void;
  onDelete: (procedure: ProcedureCatalog) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th scope="col" className="px-4 py-2 font-medium text-gray-700">
              Name
            </th>
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
              <td className="px-4 py-3">
                <span className="font-medium text-gray-900">{row.name}</span>
              </td>
              {canManage ? (
                <td className="px-4 py-3 text-right">
                  {/*
                    Only for rows this organization owns. The list mixes those
                    with the shared catalog, which the server refuses to change
                    — offering the controls anyway meant every one of the 68
                    seeded procedures had a Rename button that answered
                    "Something went wrong".
                  */}
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
