import type { Position } from './kit-detail';

/**
 * The Google Maps Static API basemap for Kit Detail's Live Location panel.
 *
 * Static rather than a tile layer because the panel's map already *is* static —
 * `kit-map.tsx` disables dragging, wheel, double-click, touch, box and keyboard
 * zoom at a fixed zoom 16 with one pin. It is a picture, so one `<img>` serves
 * it with no mapping library, and Google bakes its logo and attribution into the
 * returned image, which is what satisfies the attribution requirement.
 *
 * The alternative, Google's Map Tiles API, is XYZ-shaped and would have slotted
 * into `map-tiles.ts` — except every tile URL needs a `session` token from a
 * `POST /v1/createSession` that expires in two weeks, so it cannot be a
 * build-time variable, and a third-party renderer must draw Google's logo
 * itself. (`mt.google.com/vt/…`, which the blog posts use, is an undocumented
 * endpoint and a Maps Platform terms violation. It is not an option.)
 *
 * Without a key this returns null and the panel falls back to `kit-map.tsx` on
 * OpenStreetMap — see `map-tiles.ts` — so a checkout with no `.env` still draws
 * a map and spends nothing.
 */

const ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';

/** Matches the Leaflet fallback, so switching provider does not change the framing. */
export const MAP_ZOOM = 16;

/** The panel's map strip, in CSS pixels. Mirrored by the `h-[180px]` on its wrapper. */
export const MAP_HEIGHT = 180;

/** Static Maps caps `size` at 640×640; `scale=2` returns twice that in device pixels. */
const MAX_REQUEST_WIDTH = 640;

/**
 * Read at call time, never into a module-scope const: a const initialised on
 * import cannot be replaced by `vi.stubEnv` in a test that imported the module
 * first, which would make both branches of the panel untestable in one file.
 */
export function googleMapsKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
}

/** Whether this build has a key, and so which renderer the panel picks. */
export function hasGoogleMaps(): boolean {
  return googleMapsKey() !== '';
}

interface StaticMapOptions {
  position: Position;
  /** The rendered width of the map box, in CSS pixels. */
  containerWidth: number;
  /** The rendered height of the map box, in CSS pixels. */
  height?: number;
}

/**
 * The image URL for one fix, or null when this build has no key.
 *
 * The size arithmetic exists to keep Google's logo on screen. It sits in the
 * image's bottom-left corner, and obscuring or cropping it is a licence
 * violation — so the image must never be cropped to fit. `object-cover` on a
 * fixed 640×180 request would do exactly that: a 380px-wide box takes ~130px off
 * each side, and the logo goes with it. Requesting the box's own aspect ratio
 * instead means the image scales uniformly and nothing is lost.
 *
 * Above the 640px cap the width is clamped and the height scaled down to match,
 * so a 850×180 box gets a 640×136 image stretched uniformly by 1.33 — still no
 * crop, still no distortion.
 */
export function staticMapUrl({
  position,
  containerWidth,
  height = MAP_HEIGHT,
}: StaticMapOptions): string | null {
  const key = googleMapsKey();
  if (!key) return null;
  if (!(containerWidth > 0)) return null;

  const width = Math.min(Math.round(containerWidth), MAX_REQUEST_WIDTH);
  const scaledHeight = Math.max(1, Math.round((height * width) / containerWidth));

  const params = new URLSearchParams({
    // Built from the numbers directly. A locale-aware formatter would emit a
    // comma decimal separator in half of Europe and corrupt the coordinate.
    center: `${position[0]},${position[1]}`,
    zoom: String(MAP_ZOOM),
    size: `${width}x${scaledHeight}`,
    // Returns twice the requested pixels for HiDPI. Not a separate billable SKU.
    scale: '2',
    maptype: 'roadmap',
    format: 'png',
    key,
  });

  return `${ENDPOINT}?${params.toString()}`;
}
