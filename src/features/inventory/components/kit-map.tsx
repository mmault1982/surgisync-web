import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import type { Position } from '../kit-detail';
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from '../map-tiles';

import 'leaflet/dist/leaflet.css';

/**
 * A small, static basemap with one pin.
 *
 * The only module in the app that imports leaflet, and it is reached solely
 * through `lazy(() => import(…))` — so ~150kB of mapping library and this
 * stylesheet stay in their own chunk and never load for the untracked kits that
 * are most of the inventory. It also keeps leaflet out of jsdom, which has no
 * layout engine to run it in.
 *
 * Default export because that is what `React.lazy` wants.
 */
export default function KitMap({ position, label }: { position: Position; label: string }) {
  return (
    <div
      // Leaflet positions its tiles absolutely; Tailwind's preflight sets
      // `img { display: block; max-width: 100% }`, which shears them. Fixed at
      // the call site rather than in index.css, which is the token file and has
      // no business knowing about a mapping library.
      className="relative h-[180px] w-full overflow-hidden rounded-md [&_.leaflet-container]:size-full [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-tile]:max-w-none"
      // The address and timestamp are rendered as text directly below; a
      // non-interactive map adds nothing a screen reader can use.
      aria-hidden
    >
      <MapContainer
        center={position}
        zoom={16}
        maxZoom={TILE_MAX_ZOOM}
        // Static preview, matching the mobile panel. A scroll-zooming map
        // inside a scrolling page hijacks the wheel, and there is nothing here
        // to explore — "open in maps" is the real affordance, below.
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={TILE_MAX_ZOOM} />
        <Marker position={position} icon={pin} title={label} />
      </MapContainer>
    </div>
  );
}

/**
 * A `divIcon`, not Leaflet's default marker.
 *
 * `Icon.Default` sniffs its PNG paths from the computed background-image of
 * `.leaflet-default-icon-path`. Under a bundler that hashes asset URLs that
 * sniff resolves to a 404 — and classically it works in dev and breaks only in
 * the hashed production build, so it survives review. Inline SVG has no asset
 * to resolve, and `currentColor` lets the pin take the brand token instead of
 * hardcoding a hex.
 */
const pin = L.divIcon({
  // Leaflet's default `leaflet-div-icon` class draws a white box with a border
  // around whatever you give it; this replaces it outright.
  className: 'text-primary drop-shadow-sm',
  html: `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">
    <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z" />
    <circle cx="12" cy="9" r="2.5" fill="white" />
  </svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});
