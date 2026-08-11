import type { InventoryKitDetail, InventoryKitHistory, TrackingEvent } from '@/api/generated/model';
import { formatCalendarDate } from '@/lib/dates';

import { isExpired, statusLabels } from './stock-status';

/**
 * Everything Kit Detail derives from a record, kept out of the components so it
 * is testable without a DOM — the same split `stock-status.ts` makes for the
 * table, and for the same reason.
 */

/** Rendered in place of any value the API left empty. */
export const EMPTY = '—';

export interface KitField {
  label: string;
  value: string;
  /** Expiry is the one field that changes colour, so the card does not re-derive it. */
  emphasis?: 'expired';
  /** `ENTITY` spans both columns, as it does on mobile. */
  full?: boolean;
}

/**
 * The seven fields of the info card, in the prototype's reading order.
 *
 * The prototype has an eighth, `SITE` — dropped here because it is literal demo
 * data with no field behind it ("Main-Distributor", "Rep — J. Smith"), and the
 * mobile screen has no such cell either. Inventing a derivation for it would be
 * inventing product semantics.
 */
export function kitFields(kit: InventoryKitDetail, today = new Date()): KitField[] {
  const expired = isExpired(kit, today);

  return [
    { label: 'Manufacturer', value: kit.manufacturer_name || EMPTY },
    { label: 'Status', value: statusLabels(kit).join(' · ') },
    { label: 'Lot #', value: kit.lot_code || EMPTY },
    {
      label: 'Expiration',
      value: formatCalendarDate(kit.expiration_date) ?? EMPTY,
      ...(expired ? { emphasis: 'expired' as const } : {}),
    },
    {
      label: 'Rep / Assigned To',
      // A kit is assigned to a person or to a facility, never both; the person
      // is the more specific answer when there is one.
      value: kit.assigned_to_name || kit.assigned_to_facility_name || EMPTY,
    },
    { label: 'Physical Location', value: kit.physical_location || EMPTY },
    { label: 'Entity', value: kit.parent_company_name || EMPTY, full: true },
  ];
}

export interface BannerState {
  expiredOn: string | null;
  /**
   * The transfer destination, or `true` for a transfer whose destination the
   * API did not name — the banner still has to appear, just without the arrow.
   */
  inTransitTo: string | true | null;
}

/**
 * The two full-width banners above the card.
 *
 * `active_transfer_id` can be set with a null destination, so "In Transit"
 * cannot assume it has somewhere to point — `In Transit → null` is the bug this
 * shape prevents.
 */
export function bannerState(kit: InventoryKitDetail, today = new Date()): BannerState {
  return {
    expiredOn: isExpired(kit, today) ? (formatCalendarDate(kit.expiration_date) ?? EMPTY) : null,
    inTransitTo:
      kit.active_transfer_id === null ? null : (kit.active_transfer_destination_name ?? true),
  };
}

/** The ownership pill in the card header. Optional on the detail serializer. */
export function ownershipLabel(kit: InventoryKitDetail): string | null {
  if (!kit.ownership_type) return null;
  return kit.ownership_type.charAt(0).toUpperCase() + kit.ownership_type.slice(1);
}

/** Who a change-log entry is attributed to. Null for shell and background changes. */
export function historyActor(entry: InventoryKitHistory): string {
  return entry.history_user?.name?.trim() || 'System';
}

/**
 * A coordinate, which arrives as a decimal *string* and may be null for an
 * event reported without a fix.
 *
 * The blank check has to come first: `Number('')` and `Number(null)` are both
 * `0`, so a beacon with no fix would otherwise plot off the coast of West
 * Africa rather than reporting that it has no position.
 */
export function parseCoordinate(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mutable, not `readonly`: Leaflet's `LatLngTuple` is mutable and will not take a readonly one. */
export type Position = [number, number];

/** An event's position, or null if it carries none this map can plot. */
export function eventPosition(event: TrackingEvent | undefined): Position | null {
  if (!event) return null;
  const latitude = parseCoordinate(event.latitude);
  const longitude = parseCoordinate(event.longitude);
  if (latitude === null || longitude === null) return null;
  // The schema's `^-?\d{0,3}(\.\d{0,6})?$` permits 999. Leaflet throws outside
  // the CRS bounds, which would take the whole page down over one bad row.
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

/**
 * Where a tracker last reported from.
 *
 * `results[0]` is the current position by contract — the endpoint is ordered
 * newest-first and excludes autoclave cycles precisely so that holds (a
 * sterilization event carries no coordinates, and leading with one would make
 * a well-tracked kit claim it had never been seen). The scan past it is a
 * belt-and-braces fallback for an event that is positionless for some other
 * reason.
 */
export function currentPosition(events: readonly TrackingEvent[]): Position | null {
  for (const event of events) {
    const position = eventPosition(event);
    if (position) return position;
  }
  return null;
}

/**
 * The place names on an event, joined.
 *
 * These are required strings, so an unknown place is `''`, not null — filtering
 * on nullishness would render ", , " for a fix with no reverse geocode.
 */
export function addressLine(event: TrackingEvent | undefined): string | null {
  if (!event) return null;
  const parts = [event.location_name, event.location_city, event.location_state]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
