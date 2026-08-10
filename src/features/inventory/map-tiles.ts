/**
 * The basemap the Live Location panel draws on.
 *
 * OSM's own tile servers are the default because they need no key and they are
 * what the mobile app already uses — but they are a donation-funded service
 * whose usage policy explicitly names distributing an app that draws from them
 * as forbidden heavy use, and SurgiSync is a commercial product. Behind an env
 * var, moving to MapTiler / Stadia / Carto before this is in front of many orgs
 * costs one variable rather than a refactor.
 *
 * Attribution is not optional and must stay visible: styling the control down
 * is fine, hiding it is a licence violation. Whoever adds a CSP later needs the
 * tile host in `img-src`.
 */
export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** OSM's raster tiles stop at 19; asking for more renders blank squares. */
export const TILE_MAX_ZOOM = 19;
