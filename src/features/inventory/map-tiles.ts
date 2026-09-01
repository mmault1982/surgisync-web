/**
 * The **fallback** basemap for the Live Location panel.
 *
 * Staging and production draw Google Static Maps — see `google-static-map.ts`,
 * which is what the panel picks whenever `VITE_GOOGLE_MAPS_API_KEY` is set.
 * This path exists for the builds that have no key: every local checkout, every
 * PR, and `pnpm test:e2e`. Those need a map on screen without a billable call
 * and without every developer provisioning a key to see the panel at all.
 *
 * It is not a candidate for production. OSM's own tile servers are donation-
 * funded and their usage policy explicitly names distributing an app that draws
 * from them as forbidden heavy use, and SurgiSync is a commercial product — that
 * is the whole reason for the Google work. `web-deploy-prod.yml` carries a
 * tripwire that fires on any production deploy which resolves to this file.
 *
 * `VITE_MAP_TILE_URL` / `VITE_MAP_TILE_ATTRIBUTION` remain the seam for a
 * conventional XYZ host (MapTiler, Stadia, Carto) should one ever be wanted
 * alongside or instead of Google — that swap really is one variable, which
 * Google's is not. Both deploy workflows export them only when non-empty,
 * because the `??` below does not treat an empty string as absent and would
 * happily bake in a blank tile URL.
 *
 * Attribution is not optional and must stay visible: styling the control down
 * is fine, hiding it is a licence violation. (Google's equivalent is baked into
 * the image, so the static renderer has nothing to render here.) Whoever adds a
 * CSP later needs the tile host in `img-src`.
 */
export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** OSM's raster tiles stop at 19; asking for more renders blank squares. */
export const TILE_MAX_ZOOM = 19;
