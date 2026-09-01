/**
 * The Live Location pin, shared by both basemap renderers.
 *
 * Leaflet's `divIcon` takes an HTML *string*, the static map overlays a real
 * `<svg>` element, and the two must not drift — so the path lives here once and
 * both derive from it. A `.ts` file rather than `.tsx` on purpose: a module that
 * exports non-components beside a component trips
 * `react-refresh/only-export-components`, and `pnpm lint` runs `--max-warnings 0`.
 */

/** The teardrop outline. Sized for a 24×24 viewBox. */
export const PIN_PATH_D = 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z';

/** Rendered pin size in CSS pixels, and the anchor offset that puts its tip on the fix. */
export const PIN_SIZE = 30;

/**
 * The same pin as markup, for Leaflet's `divIcon`.
 *
 * `currentColor` rather than a hex so the pin takes the brand token from the
 * class on the icon, keeping the "no raw colour values in src/" rule intact.
 */
export const PIN_SVG = `<svg viewBox="0 0 24 24" width="${PIN_SIZE}" height="${PIN_SIZE}" fill="currentColor" aria-hidden="true">
    <path d="${PIN_PATH_D}" />
    <circle cx="12" cy="9" r="2.5" fill="white" />
  </svg>`;
