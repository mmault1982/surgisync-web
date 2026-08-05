import type { InventoryKitList } from '@/api/generated/model';

/**
 * Presentation logic for a stock row: its status labels and its stripe colour.
 *
 * Both are derived here rather than read off the API, because the API does not
 * send either. The prototype stores `stripe` as a literal string on each row and
 * never computes it, so there is no rule to copy — the one below is reverse-
 * engineered from its legend plus its eight sample rows, which agree.
 */

export type StripeTone = 'red' | 'amber' | 'green' | 'neutral';

/** The labels the Status column shows, in the order the prototype lists them. */
export function statusLabels(row: InventoryKitList): string[] {
  const labels: string[] = [];
  if (row.is_complete) labels.push('Complete');
  else labels.push('Incomplete');
  if (row.is_wrapped) labels.push('Wrapped');
  if (row.is_signed_in) labels.push('Signed In');
  if (row.is_returned) labels.push('Returned');
  if (row.is_lost) labels.push('Lost');
  if (row.is_other) labels.push('Other');
  return labels;
}

export function isExpired(row: InventoryKitList, today = new Date()): boolean {
  if (!row.expiration_date) return false;
  // Compare dates, not instants: an item expiring today is not yet expired, and
  // the API sends a plain YYYY-MM-DD with no timezone.
  return row.expiration_date < toIsoDate(today);
}

/**
 * The row's left stripe.
 *
 * Precedence is red > amber > neutral > green, which is what makes the
 * prototype's own data consistent: one of its rows is Complete but expired and
 * shows red, another is Complete but in transit and shows amber. A "worst
 * state wins" rule is also the only one that makes the stripe scannable — the
 * point of the column is to surface rows needing attention.
 *
 * The prototype's legend reads:
 *   red    Expired · Lost · Incomplete
 *   amber  In Transit · Other
 *   green  Complete · Ready
 *   gray   Signed Out · No status
 */
export function stripeTone(row: InventoryKitList, today = new Date()): StripeTone {
  if (isExpired(row, today) || row.is_lost || !row.is_complete) return 'red';
  if (row.active_transfer_id !== null || row.is_other) return 'amber';
  if (!row.is_signed_in) return 'neutral';
  return 'green';
}

/**
 * Tailwind classes per tone.
 *
 * `neutral` is a visible grey rather than transparent. The prototype renders it
 * transparent in a row but grey in its own legend — a legend entry for an
 * invisible thing teaches nothing, so the visible one wins.
 */
export const STRIPE_CLASSES: Record<StripeTone, string> = {
  red: 'bg-[#C41E3A]',
  amber: 'bg-[#F59E0B]',
  green: 'bg-[#1DB954]',
  neutral: 'bg-[#D1D5DB]',
};

export const STRIPE_LEGEND: { tone: StripeTone; label: string }[] = [
  { tone: 'red', label: 'Expired · Lost · Incomplete' },
  { tone: 'amber', label: 'In Transit · Other' },
  { tone: 'green', label: 'Complete · Ready' },
  { tone: 'neutral', label: 'Signed Out · No status' },
];

/** Tracker state for the Last Seen column. */
export type TrackerState = 'tracked' | 'pairing' | 'untracked';

export function trackerState(row: InventoryKitList): TrackerState {
  if (!row.tracker) return 'untracked';
  return row.tracker.is_active ? 'tracked' : 'pairing';
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
