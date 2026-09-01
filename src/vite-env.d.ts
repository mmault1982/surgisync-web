/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend the dev proxy forwards `/api` to. Read by `vite.config.ts`. */
  readonly VITE_PROXY_TARGET?: string;
  /**
   * Google Maps Static API key for the Live Location basemap. Public by design
   * — it ships in the bundle — so it must be locked to this app's origins by
   * HTTP referrer and to the Static Maps SKU. Unset falls back to Leaflet on
   * OSM. See `google-static-map.ts`.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Basemap tile template for the keyless fallback — see `map-tiles.ts`. */
  readonly VITE_MAP_TILE_URL?: string;
  /** Attribution HTML for that basemap. Must stay visible on the map. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
