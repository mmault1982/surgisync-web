import { PencilIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Address } from '@/api/generated/model';
import { AddressKindEnum } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { ADDRESS_KIND_LABELS, addressLabel } from '../address-form';

/**
 * An organization's address book.
 *
 * Presentational: props only, no hooks and no navigation, the same split
 * `manufacturers-table.tsx` makes.
 *
 * Hand-rolled `<table>` markup, and each column owns **both** its header and
 * its cell — on the on-hand screen those were once two parallel arrays, and
 * swapping two `<td>`s rendered the wrong field under the right header while
 * passing `tsc`, lint and every test.
 *
 * Rows render in the order the server sent them: `-is_primary, kind, id`,
 * declared on `Address.Meta` so the copy nested in the manufacturer document
 * and the standalone list cannot disagree. Re-sorting here would introduce a
 * third order.
 */
interface Column {
  key: string;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: Address) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'kind',
    label: 'Kind',
    headerClassName: 'w-44',
    cell: (row) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-gray-900">
          {ADDRESS_KIND_LABELS[row.kind ?? AddressKindEnum.physical]}
        </span>
        {/*
          At most one per organization per kind, enforced by a partial unique
          index — so this is a fact about the row, not a preference.
        */}
        {row.is_primary ? <Badge variant="secondary">Primary</Badge> : null}
      </div>
    ),
  },
  {
    key: 'label',
    label: 'Label',
    headerClassName: 'w-40',
    cell: (row) => row.label?.trim() || <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'address',
    label: 'Address',
    cell: (row) => {
      const lines = [
        row.address_line_1,
        row.address_line_2,
        [row.city, row.state].filter((part) => part?.trim()).join(', '),
        [row.zip_code, row.country].filter((part) => part?.trim()).join(' '),
      ].filter((line) => line?.trim());

      // Every column on `Address` is blankable and migration 0131 backfilled
      // partial rows, so "no street at all" is a state that really occurs.
      if (lines.length === 0)
        return <span className="text-muted-foreground">No address given</span>;
      return (
        <div className="whitespace-pre-line">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      );
    },
  },
  {
    key: 'contact',
    label: 'Contact',
    headerClassName: 'w-48',
    cell: (row) => {
      const parts = [row.contact_name, row.phone].filter((part) => part?.trim());
      if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div>
          {parts.map((part) => (
            <div key={part}>{part}</div>
          ))}
        </div>
      );
    },
  },
];

export function ManufacturerAddressesTable({
  rows,
  canManage,
  onEdit,
  onDelete,
}: {
  rows: readonly Address[];
  /** Whole column, not disabled buttons: a control nobody can use is noise. */
  canManage: boolean;
  onEdit: (address: Address) => void;
  onDelete: (address: Address) => void;
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
            <tr key={row.id} className="border-b border-gray-100 last:border-0 align-top">
              {COLUMNS.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ''}`}>
                  {column.cell(row)}
                </td>
              ))}
              {canManage ? (
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${addressLabel(row)}`}
                      onClick={() => onEdit(row)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${addressLabel(row)}`}
                      onClick={() => onDelete(row)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
