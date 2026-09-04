import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';

import { errorMessage, isNotFound } from '@/api/errors';
import { confirmInventoryTransferReceipt } from '@/api/generated/endpoints/inventory/inventory';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import {
  confirmCopy,
  destinationName,
  originName,
  transferFacts,
  transferPhotos,
} from '../confirm-receipt';
import { stockItemKeys, transferKeys } from '../inventory.keys';
import { EMPTY } from '../kit-detail';
import { transferQueries } from '../transfer.queries';

import { PhotoLightbox, PhotoTile, type PhotoTileData } from './photo-tile';

/**
 * The transfer a kit is currently on, and the button that ends it.
 *
 * Reached from the In Transit banner, which is what the prototype does. It
 * fetches the transfer rather than working from the kit's
 * `active_transfer_destination_name` alone, so the user can see what is
 * arriving — route, reason, transport, when it was sent — before confirming
 * receipt of it.
 *
 * Cancelling a transfer is deliberately not here. The prototype's banner offers
 * both; this build offers the half that exists, and the banner's copy promises
 * only that.
 *
 * The photos are the part that makes "review" mean anything: confirming receipt
 * is agreeing that something arrived, and the two shots taken at dispatch are
 * the only evidence of what that something was.
 */
export function PendingTransferDialog({
  transferId,
  onClose,
}: {
  transferId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoTileData | null>(null);

  const transfer = useQuery(transferQueries.detail(transferId));

  const confirm = useMutation({
    retry: false,
    mutationFn: () => confirmInventoryTransferReceipt(transferId),
    onSuccess: () => {
      // Read before the invalidation below: this is what decides whether the
      // page underneath still exists. The confirm button is disabled until the
      // transfer has loaded, so `transfer.data` is always here.
      const removesKit = transfer.data ? confirmCopy(transfer.data).removesKit : false;
      // The transfer is gone either way: it is soft-deleted, so re-reading it
      // 404s. Drop it from the cache rather than refetching a dead row.
      queryClient.removeQueries({ queryKey: transferKeys.detail(transferId) });
      void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      onClose();
      // A return soft-deletes the kit along with the transfer, so the route
      // behind this dialog no longer resolves. Leave rather than land the user
      // on a detail page for a kit that no longer exists.
      if (removesKit) void navigate({ to: '/inventory/on-hand' });
    },
  });

  const copy = transfer.data ? confirmCopy(transfer.data) : null;
  const photos = transfer.data ? transferPhotos(transfer.data) : [];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !confirm.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TruckIcon aria-hidden className="size-5 text-warning" />
            Pending Transfer
          </DialogTitle>
          <DialogDescription>
            {copy?.detail ?? 'This kit is in transit. Review the transfer before confirming it.'}
          </DialogDescription>
        </DialogHeader>

        {transfer.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : transfer.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {isNotFound(transfer.error)
              ? // Someone else confirmed or cancelled it while this was open.
                'This transfer is no longer open. Refresh to see where the kit is now.'
              : errorMessage(transfer.error)}
          </p>
        ) : transfer.data ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-warning bg-warning-container px-4 py-3">
              <RouteEnd label="From" value={originName(transfer.data)} />
              <ArrowRightIcon aria-hidden className="size-5 shrink-0 text-warning-foreground" />
              <RouteEnd label="To" value={destinationName(transfer.data)} />
            </div>

            <dl className="grid grid-cols-3 gap-3 text-sm">
              {transferFacts(transfer.data).map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {photos.length > 0 ? (
              // No section heading: each tile is already headed "Kit Photo" or
              // "Shipping Label", which reads as one more row of the facts above.
              <ul className="flex gap-2.5">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <PhotoTile photo={photo} onOpen={() => setSelectedPhoto(photo)} />
                  </li>
                ))}
              </ul>
            ) : null}

            {transfer.data.notes?.trim() ? (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                {/* Returns fold their reason and condition in here, so this can
                    be two paragraphs — preserve the breaks the writer made. */}
                <p className="mt-0.5 text-sm whitespace-pre-line text-foreground">
                  {transfer.data.notes.trim()}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {confirm.error ? (
          <p role="alert" className="text-sm text-destructive">
            {isNotFound(confirm.error)
              ? 'This transfer was already completed elsewhere.'
              : errorMessage(confirm.error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={confirm.isPending}
            onClick={onClose}
            className="sm:flex-1"
          >
            Close
          </Button>
          <Button
            type="button"
            // Nothing to confirm until the transfer has loaded — and a failed
            // load leaves this disabled rather than firing blind.
            disabled={!transfer.data || confirm.isPending}
            onClick={() => confirm.mutate()}
            className="sm:flex-1"
          >
            {confirm.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Confirming"
              />
            ) : (
              (copy?.action ?? 'Confirm Receipt')
            )}
          </Button>
        </DialogFooter>

        {/*
          Nested inside this dialog rather than replacing it: the user is here
          to review a transfer, and looking at a photo should not lose the route,
          the facts and the confirm button behind it. Radix stacks dismissable
          layers, so Escape and an outside click reach the photo only.
        */}
        {selectedPhoto ? (
          <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RouteEnd({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[11px] font-bold tracking-wide text-warning-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value ?? EMPTY}</p>
    </div>
  );
}
