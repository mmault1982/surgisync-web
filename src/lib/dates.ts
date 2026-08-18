/**
 * Date rendering for the API's two different date shapes.
 *
 * They need different treatment, and conflating them is the bug this module
 * exists to prevent:
 *
 * - **Calendar dates** (`expiration_date`, `loaner_due_date`) arrive as a bare
 *   `YYYY-MM-DD` with no timezone. `new Date('2027-03-01')` parses that as UTC
 *   midnight, which formats as *28 February* anywhere west of Greenwich — so
 *   these are formatted by splitting the string, never by constructing a Date.
 * - **Instants** (`history_date`, `occurred_at`, `last_sterilized_at`) are real
 *   ISO date-times, where a Date is exactly right and the local timezone is
 *   what the reader wants.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A calendar date as the prototype writes it: `2027-03-01` -> `03-01-2027`. */
export function formatCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return null;
  return `${month}-${day}-${year}`;
}

/**
 * An instant as the activity log's date column: `Jan 28`, gaining the year when
 * it is not the current one. A bare `Jan 28` on a two-year-old entry reads as
 * this January.
 */
export function formatLogDate(value: string | null | undefined, now = new Date()): string | null {
  const date = toDate(value);
  if (!date) return null;
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label}, ${date.getFullYear()}`;
}

/** An instant with its time, for "Last sterilized": `Jan 28, 2:15 PM`. */
export function formatLogDateTime(
  value: string | null | undefined,
  now = new Date(),
): string | null {
  const date = toDate(value);
  if (!date) return null;
  // Locale pinned rather than left ambient: the rest of this module renders
  // US formats (MM-DD-YYYY, `Jan 28`), and an unpinned locale silently drops
  // the AM/PM marker on hosts whose default resolves to a 24-hour format —
  // including, as it happens, the test runner.
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${formatLogDate(value, now)}, ${time}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago an instant was: `just now`, `12 min ago`, `3 hours ago`, `5 days ago`. */
export function formatRelative(value: string | null | undefined, now = new Date()): string | null {
  const date = toDate(value);
  if (!date) return null;

  // Clamped at zero: clock skew between the beacon, the server and this browser
  // makes a near-future timestamp routine, and "in -1 minutes" helps nobody.
  const elapsed = Math.max(0, now.getTime() - date.getTime());

  if (elapsed < MINUTE) return 'just now';
  // `min` stays singular at every count, matching the mobile app's wording —
  // the two clients show this string against the same beacon.
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
  return plural(Math.floor(elapsed / DAY), 'day');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `YYYY-MM-DD` for a local calendar day — never `toISOString`, which is UTC.
 *
 * The inbound half of what this module already guards on the way out: a form
 * that writes a calendar date has the same off-by-one-day trap as one that
 * renders it, in the opposite direction.
 */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The inverse, for seeding a calendar's selection.
 *
 * Built from parts rather than `new Date('2026-04-22')`, which parses as UTC
 * midnight and lands on the 21st anywhere west of Greenwich — the same trap
 * this module's header documents for rendering.
 */
export function fromDateInput(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
