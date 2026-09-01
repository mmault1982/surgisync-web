import { useEffect, useRef, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { staticMapUrl } from '../google-static-map';
import type { Position } from '../kit-detail';
import { PIN_PATH_D, PIN_SIZE } from '../map-pin';

/** Measured widths are rounded up to this, so a resize does not spray billable URLs. */
const WIDTH_STEP = 10;

/** Applied to changes, never to the first measurement — see the observer below. */
const RESIZE_DEBOUNCE_MS = 200;

/**
 * The Live Location basemap, as one Google Static Maps image.
 *
 * Not lazy, unlike its Leaflet counterpart: there is no library here to defer,
 * just an `<img>`. Google draws its own logo and attribution into the image, so
 * nothing has to be rendered beside it — but that logo sits in the bottom-left
 * corner and obscuring it is a licence violation, which is why the image is
 * never cropped (`google-static-map.ts` requests the box's own aspect ratio
 * instead) and why the pin is centred rather than placed.
 */
export function KitStaticMap({ position, label }: { position: Position; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const measured = useRef(0);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = box.current;
    // jsdom implements neither, and there is nothing to measure without layout.
    if (!node || typeof ResizeObserver === 'undefined') return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const commit = (next: number) => {
      measured.current = next;
      setWidth(next);
    };

    // A ResizeObserver rather than a `window.resize` listener: the sidebar
    // collapses without resizing the window, and that changes this column's
    // width by ~200px — the same case the Kit Detail grid's own comment calls
    // out for choosing a container query over a viewport breakpoint.
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? node.clientWidth;
      if (!(next > 0)) return;

      const bucketed = Math.ceil(next / WIDTH_STEP) * WIDTH_STEP;
      if (bucketed === measured.current) return;

      clearTimeout(timer);
      if (measured.current === 0) {
        // First paint is not debounced. Holding the map back 200ms on every
        // page load to guard against a drag that is not happening is a bad
        // trade; the debounce below is only for the drag.
        commit(bucketed);
      } else {
        timer = setTimeout(() => commit(bucketed), RESIZE_DEBOUNCE_MS);
      }
    });

    observer.observe(node);
    // Both matter under `<StrictMode>`, which mounts every effect twice.
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const url = staticMapUrl({ position, containerWidth: width });

  return (
    <div ref={box} className="relative h-[180px] w-full overflow-hidden rounded-md">
      {failed ? (
        // Deliberately outside the `aria-hidden` below: this is the one thing
        // in the map box a screen reader has any use for. A revoked key, a
        // referrer mismatch and an exhausted quota all land here, and the
        // address and timestamp rows underneath still carry the real answer.
        <p className="flex size-full items-center justify-center bg-muted px-4 text-center text-xs text-muted-foreground">
          Map unavailable.
        </p>
      ) : url ? (
        // Hidden from assistive tech for the same reason the Leaflet map is:
        // the address and timestamp are rendered as text directly below, and a
        // non-interactive basemap adds nothing on top of them.
        <div className="relative size-full" aria-hidden>
          <img
            src={url}
            alt=""
            title={label}
            className="size-full"
            onError={() => setFailed(true)}
          />
          {/*
            A DOM overlay, not Google's `markers=` parameter, which would need
            the brand pin hosted somewhere public as a PNG. The image is centred
            on the fix, so dead centre *is* the fix — and the anchor matches
            Leaflet's `iconAnchor: [15, 30]`, putting the tip on the point. It
            cannot reach the bottom-left logo at any width this panel takes.
          */}
          <svg
            viewBox="0 0 24 24"
            width={PIN_SIZE}
            height={PIN_SIZE}
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full fill-current text-primary drop-shadow-sm"
          >
            <path d={PIN_PATH_D} />
            <circle cx="12" cy="9" r="2.5" className="fill-white" />
          </svg>
        </div>
      ) : (
        // Width is still 0: pre-measurement, or a build with no key that should
        // never have rendered this component. Same box, so nothing jumps.
        <Skeleton className="size-full rounded-none" />
      )}
    </div>
  );
}
