import { ImageOffIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { EMPTY } from '../kit-detail';

/**
 * A read-only photo thumbnail and the dialog it opens, shared by every screen
 * that shows photos it did not capture.
 *
 * Extracted from `kit-photos.tsx` when Pending Transfer needed the same pair:
 * the tile string below had already been copied into four files, and a fifth
 * that also had to match the kit's exactly — same size, same caption, same
 * full-size UI — was the point to stop copying it.
 */

export interface PhotoTileData {
  /** React key only. `string | number` so `KitPhoto` fits with no mapping. */
  id: string | number;
  /** Presigned, and null for a photo the server has not finished processing. */
  url: string | null;
  /** Already formatted for display, e.g. `Apr 22, 9:00 AM`. */
  takenAt: string | null;
  /** The photo's own caption, when it has one. */
  caption: string | null;
  /**
   * What this photo is, when the set is heterogeneous — "Kit Photo" versus
   * "Shipping Label". A kit's gallery is all one kind and passes none, which is
   * what keeps its tiles and their accessible names exactly as they were.
   */
  label?: string;
}

const TILE = 'block size-24 overflow-hidden rounded-lg border bg-muted';

export function PhotoTile({ photo, onOpen }: { photo: PhotoTileData; onOpen: () => void }) {
  return (
    <figure>
      {photo.label ? <p className="mb-1 text-xs text-muted-foreground">{photo.label}</p> : null}

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
          aria-label={`View ${photoName(photo)}`}
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
export function PhotoLightbox({ photo, onClose }: { photo: PhotoTileData; onClose: () => void }) {
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
        <DialogTitle className="sr-only">{capitalize(photoName(photo))}</DialogTitle>
        <img
          src={photo.url ?? undefined}
          alt={photo.caption ?? ''}
          className="mx-auto max-h-[calc(100dvh-6rem)] w-auto max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * How a photo is named to a screen reader: `Kit Photo, Apr 22, 9:00 AM`.
 *
 * Falls back to a bare `photo` with no label, which is what the kit gallery
 * passes — its names have to stay exactly what they were.
 */
function photoName(photo: PhotoTileData): string {
  const name = photo.label ?? 'photo';
  return photo.takenAt ? `${name}, ${photo.takenAt}` : name;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
