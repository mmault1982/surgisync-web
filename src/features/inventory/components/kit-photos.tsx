import { ImageOffIcon } from 'lucide-react';
import { useState } from 'react';

import type { InventoryKitDetail } from '@/api/generated/model';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { EMPTY, kitPhotos, type KitPhoto } from '../kit-detail';

/**
 * The kit's photos, newest first, each opening full-size.
 *
 * Its own component rather than more of `kit-info-card.tsx` because it is the
 * one part of that card with state — keeping it here leaves the card purely
 * prop-driven, which is what lets its test render with no queries and no
 * router.
 *
 * One dialog driven by which photo is selected, not one per tile: the photo is
 * the only thing that differs, and a card of ten would otherwise mount ten
 * closed portals to show at most one.
 */
export function KitPhotos({ kit }: { kit: InventoryKitDetail }) {
  const photos = kitPhotos(kit);
  const [selected, setSelected] = useState<KitPhoto | null>(null);

  if (photos.length === 0) return <>{EMPTY}</>;

  return (
    <>
      {/*
        Column counts step on the *card's* width — `kit-info-card.tsx` makes it
        an `@container` for this. Keyed to the page container instead they would
        be non-monotonic and overflow: at `@4xl` the detail route splits into
        `1.4fr 1fr`, so the card drops from full width to ~58% of it, and a
        count that fitted a moment earlier no longer does.

        N 96px tiles at `gap-2.5` need `card >= 106N + 22` once `CardContent`'s
        32px of padding is paid, which lands on these five steps and not the
        even ones. `@lg` is the trap: it is 512px and the standard two-column
        desktop card is 511px, so keying 4 columns to it would show 3 on the
        commonest layout of all.

        `w-fit` is what keeps the tiles a fixed 96px. Left to stretch, six `1fr`
        tracks in a 875px card are 132px wide and the row reads as 46px gaps
        with the thumbnails adrift in it; under `fit-content` the tracks size to
        the tile instead. It still clamps to the card, so a narrow card shrinks
        the tracks rather than overflowing.
      */}
      <ul className="grid w-fit grid-cols-2 gap-2.5 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 @2xl:grid-cols-6">
        {photos.map((photo) => (
          <li key={photo.id}>
            <PhotoTile photo={photo} onOpen={() => setSelected(photo)} />
          </li>
        ))}
      </ul>

      {selected ? <PhotoDialog photo={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

const TILE = 'block size-24 overflow-hidden rounded-lg border bg-muted';

function PhotoTile({ photo, onOpen }: { photo: KitPhoto; onOpen: () => void }) {
  return (
    <figure>
      {photo.url === null ? (
        // `url` is nullable on the API, so a photo the server has not finished
        // processing still gets a tile rather than a broken image — and not a
        // button, because there is nothing to open.
        <div className={cn(TILE, 'flex items-center justify-center text-muted-foreground')}>
          <ImageOffIcon aria-hidden className="size-5" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={photo.takenAt ? `View photo, ${photo.takenAt}` : 'View photo'}
          className={cn(
            TILE,
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          {/* The button already names the control, so the image itself is
              decorative unless the photo carries a caption of its own. */}
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            loading="lazy"
            className="size-full object-cover"
          />
        </button>
      )}

      <figcaption className="mt-1 text-xs text-muted-foreground">
        {photo.takenAt ?? EMPTY}
      </figcaption>
    </figure>
  );
}

/**
 * One photo, full size.
 *
 * The title is present but hidden: this is the app's first dialog with nothing
 * to head it, and a `role="dialog"` with no accessible name is a real defect
 * for anyone arriving by screen reader. Not a warning silencer — Radix 1.1.23
 * emits no console output and already omits `aria-describedby` when no
 * description is rendered, so there is nothing here to appease.
 */
function PhotoDialog({ photo, onClose }: { photo: KitPhoto; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/*
        `sm:w-fit` so the frame hugs the photo. The primitive is `w-full` up to
        its max, which letterboxes anything smaller than the cap in white — and
        with nothing else in this dialog, that reads as a broken image rather
        than as a deliberate mat. `max-w-full` on the image is the other half:
        `w-auto` alone would let a 4000px photo push out of the frame.
      */}
      <DialogContent className="p-2 sm:w-fit sm:max-w-3xl">
        <DialogTitle className="sr-only">
          {photo.takenAt ? `Photo, ${photo.takenAt}` : 'Photo'}
        </DialogTitle>
        <img
          src={photo.url ?? undefined}
          alt={photo.caption ?? ''}
          className="mx-auto max-h-[calc(100dvh-6rem)] w-auto max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
