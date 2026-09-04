import { useState } from 'react';

import type { InventoryKitDetail } from '@/api/generated/model';

import { EMPTY, kitPhotos, type KitPhoto } from '../kit-detail';

import { PhotoLightbox, PhotoTile } from './photo-tile';

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
            {/* No `label`: a kit's photos are all the same kind of thing, so
                naming each one would say nothing the caption does not. */}
            <PhotoTile photo={photo} onOpen={() => setSelected(photo)} />
          </li>
        ))}
      </ul>

      {selected ? <PhotoLightbox photo={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
