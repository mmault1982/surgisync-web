import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import {
  createCompanyAddress,
  deleteCompanyAddress,
  partialUpdateCompanyAddress,
} from '@/api/generated/endpoints/inventory/inventory';
import type { Address } from '@/api/generated/model';
import { AddressKindEnum } from '@/api/generated/model';
import { DeleteDialog } from '@/components/delete-dialog';
import { TableEmpty } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  ADDRESS_KIND_LABELS,
  addressLabel,
  buildAddressBody,
  buildAddressPatch,
} from '../address-form';
import { manufacturerKeys } from '../directory.keys';

import { AddressDialog } from './address-dialog';
import { ManufacturerAddressesTable } from './manufacturer-addresses-table';

/**
 * An organization's address book, below its manufacturer's record.
 *
 * A sibling of `ManufacturerDetailScreen` mounted by the route, not a child of
 * it — that screen is props-only with no hooks, no query client and no router,
 * which is what lets its test render it bare, and this panel needs two of the
 * three. Product Detail composes its Bill of Materials the same way.
 *
 * The container half of the usual split: this owns the three dialogs and the
 * mutations, `ManufacturerAddressesTable` owns the markup.
 *
 * **It owns no query.** The rows arrive as a prop, off the composite read the
 * route already made — one request answers the manufacturer, its `Company` and
 * that company's addresses. So unlike `KitComponentsCard` there is no loading
 * or error state here (both belong to the route's loader) and no pager (the
 * collection is unpaginated by design: an address book is a handful of rows).
 */
export function ManufacturerAddressesCard({
  companyId,
  addresses,
  canManage,
}: {
  /**
   * The **company's** id, never the manufacturer's. They are unrelated
   * integers, and the backend publishes this one precisely so a client can
   * notice when two roles share one address book.
   */
  companyId: number;
  addresses: readonly Address[];
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  // The detail documents, not the listing: an address cannot change a table
  // showing a name and whether a barcode exists, and evicting `catalogKeys`
  // would throw away a warm Receive-picker cache for a change that cannot
  // reach it. The prefix rather than one id, because two manufacturer roles
  // may share this company — see `directory.keys.ts`.
  const invalidates = [manufacturerKeys.details()] as const;

  return (
    <Card className="mt-5 max-w-5xl gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-3.5">
        {/* A real heading — the card is a region, and a `<div>` gives a screen
            reader nothing to jump to. */}
        <CardTitle asChild>
          <h2>Addresses</h2>
        </CardTitle>
        {canManage ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add address
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="px-0 py-0">
        {/*
          Said where it is true rather than left to be discovered. The book
          hangs off the shared `Company` identity, which one organization's
          facility and tenant rows may point at too — so an address edited here
          is edited for those as well. `company.id` exists in the payload for
          exactly this reason.
        */}
        <p className="border-b bg-gray-50 px-4 py-2 text-xs text-muted-foreground">
          These addresses belong to the organization behind this manufacturer, and are shared with
          any other role it plays.
        </p>

        {addresses.length === 0 ? (
          // "recorded", not "yet": "nothing here" and "nobody has filled this
          // in" are different claims, and only the second is one this screen
          // can support. No `action` — the Add button is already in the header.
          <TableEmpty
            title="No addresses recorded"
            description={
              canManage
                ? 'Add one so shipments and invoices have somewhere to go.'
                : "Nothing has been added to this organization's address book."
            }
          />
        ) : (
          <ManufacturerAddressesTable
            rows={addresses}
            canManage={canManage}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        )}
      </CardContent>

      {/* Each dialog is mounted only while open, so a draft cannot outlive a
          close and every open reseeds from the row. */}
      {adding ? (
        <AddressDialog
          address={null}
          addresses={addresses}
          onSave={(values) => createCompanyAddress(companyId, buildAddressBody(values))}
          invalidates={invalidates}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {editing ? (
        <AddressDialog
          address={editing}
          addresses={addresses}
          onSave={(values, address) =>
            partialUpdateCompanyAddress(companyId, address!.id, buildAddressPatch(values, address!))
          }
          invalidates={invalidates}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        // No `conflictCode`: the endpoint documents no 409. The delete is soft,
        // so the copy avoids "permanently" — which `DeleteDialog`'s own
        // docstring bans for exactly this reason.
        <DeleteDialog
          title={`Remove ${addressLabel(deleting)}?`}
          description={
            'It stops appearing in this address book. Shipments already using it keep pointing at it.' +
            // The server promotes nothing in its place — which addresses should
            // take over is a decision, not an ordering — and this confirmation
            // is the only place anyone can learn that before the fact.
            (deleting.is_primary
              ? ` It is the primary ${ADDRESS_KIND_LABELS[
                  deleting.kind ?? AddressKindEnum.physical
                ].toLowerCase()} address; removing it leaves that kind without one.`
              : '')
          }
          onDelete={() => deleteCompanyAddress(companyId, deleting.id)}
          invalidates={invalidates}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </Card>
  );
}
