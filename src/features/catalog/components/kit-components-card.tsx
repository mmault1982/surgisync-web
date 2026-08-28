import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import {
  createPartComponent,
  deletePartComponent,
  partialUpdatePartComponent,
} from '@/api/generated/endpoints/inventory/inventory';
import type { PartComponent } from '@/api/generated/model';
import { DeleteDialog } from '@/components/delete-dialog';
import { Pagination } from '@/components/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/table-states';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { productCatalogKeys } from '../catalog.keys';
import { kitComponentsQuery } from '../catalog.queries';
import { DEFAULT_PAGE_SIZE } from '../catalog.search';
import { componentLabel } from '../kit-components';

import { AddComponentDialog } from './add-component-dialog';
import { ComponentQuantityDialog } from './component-quantity-dialog';
import { KitComponentsTable } from './kit-components-table';

/**
 * A kit's Bill of Materials, below its record on the Product Detail screen.
 *
 * A sibling of `ProductDetailScreen` mounted by the route, not a child of it.
 * That screen is props-only with no hooks, no query client and no router —
 * which is what lets its test render it bare — and this panel needs all three.
 * Kit Detail composes its cards the same way and for the same reason: a slow
 * or broken secondary panel must not hold up the record above it.
 *
 * The container half of the usual split, so `KitComponentsTable` stays pure:
 * this owns the query and the three dialogs, that one owns the markup.
 */
export function KitComponentsCard({
  kitId,
  kitManufacturerId,
  canManage,
  onOpenRow,
}: {
  kitId: number;
  /** The manufacturer a typed catalog number must resolve within. */
  kitManufacturerId: number;
  canManage: boolean;
  /** Called with the **component part's** id, not the BOM row's. */
  onOpenRow: (partId: number) => void;
}) {
  // Page state is local, not in the URL. The address bar identifies the part,
  // and a BOM page is a position inside a panel on it — worth keeping while the
  // screen is open, not worth putting in a link someone might share.
  const [page, setPage] = useState(1);
  const query = useQuery(kitComponentsQuery(kitId, page));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PartComponent | null>(null);
  const [deleting, setDeleting] = useState<PartComponent | null>(null);

  // Every page of this kit's BOM, so a write refetches whichever one is on
  // screen. Only this kit's: a component's place in a kit says nothing about
  // the catalog listing or the Receive form's picker, and invalidating those
  // would evict a warm five-minute cache for a change that cannot affect it.
  const invalidates = [productCatalogKeys.componentsAll(kitId)] as const;
  const rows = query.data?.results ?? [];

  return (
    // Wider than the record card above it, which is `max-w-3xl`. That card is a
    // two-column definition list and reads better narrow; this is a five-column
    // table whose Description column carries strings like "Screw, Multi-Thread,
    // Compression, 2.7mm x 10mm, Ti". At 3xl the row overflows and the Actions
    // column lands off the right edge behind a horizontal scrollbar — present,
    // but invisible to anyone who does not think to scroll a table sideways.
    <Card className="mt-5 max-w-5xl gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-3.5">
        {/* A real heading, like the panels on Kit Detail — the card is a
            region, and a `<div>` gives a screen reader nothing to jump to. */}
        <CardTitle asChild>
          <h2>Bill of Materials</h2>
        </CardTitle>
        {canManage ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add component
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="px-0 py-0">
        {query.isPending ? (
          <TableLoading label="Loading components" />
        ) : query.isError ? (
          <TableError
            title="Could not load the bill of materials"
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          // "recorded", not "yet": on a kit, "nothing here" and "nobody has
          // filled this in" are different claims and only the second is one
          // this screen can support.
          <TableEmpty
            title="No components recorded"
            description="Nothing has been added to this kit's bill of materials."
          />
        ) : (
          <>
            <KitComponentsTable
              rows={rows}
              canManage={canManage}
              onOpenRow={onOpenRow}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
            {/*
              Not optional chrome. The median kit in the catalog holds 59
              components and the largest holds 315, and a table of 315 rows —
              each with a `<Link>` subscribing to router state — freezes the
              renderer outright. The pager is what keeps the row count bounded.
            */}
            <Pagination
              page={query.data?.current_page ?? page}
              pageSize={DEFAULT_PAGE_SIZE}
              totalItems={query.data?.total_data ?? 0}
              totalPages={query.data?.total_pages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>

      {/* Each dialog is mounted only while open, so a draft cannot outlive a
          close and every open reseeds from the row. */}
      {adding ? (
        <AddComponentDialog
          kitManufacturerId={kitManufacturerId}
          onAdd={(item, quantity) => createPartComponent(kitId, { item, quantity })}
          invalidates={invalidates}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {editing ? (
        <ComponentQuantityDialog
          label={componentLabel(editing)}
          initialQuantity={editing.quantity}
          onSave={(quantity) => partialUpdatePartComponent(kitId, editing.id, { quantity })}
          invalidates={invalidates}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        // No `conflictCode`: this delete has nothing to refuse for. A BOM row
        // is template membership, so unlike a catalog part there is no stock
        // hanging off it.
        <DeleteDialog
          title={`Remove ${componentLabel(deleting)} from this kit?`}
          description="The part stays in your catalog — only its place in this kit's bill of materials is removed. You can add it back by catalog number."
          onDelete={async () => {
            await deletePartComponent(kitId, deleting.id);
            // Removing the last row of the last page would otherwise leave the
            // user on a page that no longer exists, looking at an empty table.
            if (rows.length === 1 && page > 1) setPage(page - 1);
          }}
          invalidates={invalidates}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </Card>
  );
}
