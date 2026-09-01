import { ExternalLinkIcon, MapPinIcon } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';

import type { InventoryKitDetail, TrackingEvent } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLogDateTime, formatRelative } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { hasGoogleMaps } from '../google-static-map';
import { addressLine, currentPosition } from '../kit-detail';

import { DetachTrackerDialog } from './detach-tracker-dialog';
import { KitStaticMap } from './kit-static-map';

// Lazy so leaflet and its stylesheet never load for an untracked kit, never
// load at all in a build that has a Google Maps key, and never enter a jsdom
// test's module graph. Note that lazy() alone is not a barrier — Vitest resolves
// a dynamic import on the next microtask — so the real guard is that this panel
// only reaches it with coordinates *and* no key, and no unit test supplies both.
const KitMap = lazy(() => import('./kit-map'));

interface Props {
  kit: InventoryKitDetail;
  events: readonly TrackingEvent[] | undefined;
  isPending: boolean;
  isError: boolean;
  className?: string;
}

/**
 * Where a tracked kit last reported from.
 *
 * Rendered off `kit.tracker`, not off the events query, so a failed or empty
 * location fetch never makes an attached beacon disappear from the screen.
 */
export function KitLocationPanel({ kit, events, isPending, isError, className }: Props) {
  const [detachOpen, setDetachOpen] = useState(false);

  const tracker = kit.tracker;
  if (!tracker) return null;

  // `results[0]` is the current position by contract: the endpoint is ordered
  // newest-first and excludes autoclave cycles, which carry no coordinates.
  const latest = events?.[0];
  const position = currentPosition(events ?? []);
  const address = addressLine(latest);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-info bg-info-container/40',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-info/40 bg-info-container px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-info">
          <MapPinIcon aria-hidden className="size-4" />
          Live Location
        </h2>
        <span className="truncate font-mono text-xs text-info">{tracker.beacon_id}</span>
      </header>

      {isPending ? (
        // Sized to the map exactly, so the panel does not jump when it lands.
        <Skeleton className="h-[180px] w-full rounded-none" />
      ) : isError ? (
        <MapSlot>Location unavailable right now.</MapSlot>
      ) : position ? (
        <div className="p-3">
          {/*
            Google Static Maps where a key is configured, OpenStreetMap through
            Leaflet where it is not. The condition is the key rather than a
            provider name because there is nothing to choose between: OSM's tile
            policy rules it out for a commercial product, so it exists only to
            keep a keyless checkout — every local dev and every PR — drawing a
            map for free. See `google-static-map.ts`.
          */}
          {hasGoogleMaps() ? (
            <KitStaticMap position={position} label={address ?? kit.part_name} />
          ) : (
            <Suspense fallback={<Skeleton className="h-[180px] w-full" />}>
              <KitMap position={position} label={address ?? kit.part_name} />
            </Suspense>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${position[0]},${position[1]}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
          >
            Open in maps
            <ExternalLinkIcon aria-hidden className="size-3" />
          </a>
        </div>
      ) : (
        <MapSlot>No tracking data received yet.</MapSlot>
      )}

      <dl className="space-y-1.5 px-4 py-3 text-xs">
        <Row label="Address" value={address ?? (position ? 'In transit' : '—')} />
        <Row label="Last seen" value={formatRelative(latest?.occurred_at) ?? '—'} />
        <Row label="Last sterilized" value={formatLogDateTime(kit.last_sterilized_at) ?? 'Never'} />
      </dl>

      <div className="flex items-center justify-between border-t border-info/30 px-2 py-1">
        {/* Still a stub: the history screen does not exist yet. */}
        <Button variant="link" size="sm" className="text-info" onClick={() => {}}>
          View location history ›
        </Button>
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setDetachOpen(true)}
        >
          Detach tracker
        </Button>
      </div>

      {/* Mounted only while open, like every other dialog in this feature. */}
      {detachOpen && <DetachTrackerDialog kit={kit} onClose={() => setDetachOpen(false)} />}
    </section>
  );
}

function MapSlot({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-[180px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
