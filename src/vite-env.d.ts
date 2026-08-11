/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend the dev proxy forwards `/api` to. Read by `vite.config.ts`. */
  readonly VITE_PROXY_TARGET?: string;
  /** Basemap tile template. Defaults to OSM — see `map-tiles.ts`. */
  readonly VITE_MAP_TILE_URL?: string;
  /** Attribution HTML for that basemap. Must stay visible on the map. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
