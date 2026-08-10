import { describe, expect, it } from 'vitest';

import { formatCalendarDate, formatLogDate, formatLogDateTime, formatRelative } from '../dates';

const NOW = new Date('2026-04-22T12:00:00Z');

describe('formatCalendarDate', () => {
  it('reorders a bare YYYY-MM-DD without ever constructing a Date', () => {
    expect(formatCalendarDate('2027-03-01')).toBe('03-01-2027');
  });

  /**
   * The whole reason this function splits the string.
   *
   * `new Date('2027-03-01')` is UTC midnight; rendered in any timezone west of
   * Greenwich — which is every US office this ships to — that is 28 February.
   * An expiry date that reads a day early is the kind of bug nobody catches
   * because it is only ever wrong on someone else's machine.
   */
  it('is stable regardless of the machine timezone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatCalendarDate('2027-03-01')).toBe('03-01-2027');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(formatCalendarDate('2027-03-01')).toBe('03-01-2027');
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns null for a missing or malformed date', () => {
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate(undefined)).toBeNull();
    expect(formatCalendarDate('')).toBeNull();
    expect(formatCalendarDate('2027-03')).toBeNull();
  });
});

describe('formatLogDate', () => {
  it('omits the year in the current year', () => {
    expect(formatLogDate('2026-01-28T09:00:00Z', NOW)).toBe('Jan 28');
  });

  it('states the year otherwise, so an old entry cannot read as recent', () => {
    expect(formatLogDate('2025-01-28T09:00:00Z', NOW)).toBe('Jan 28, 2025');
  });

  it('returns null for a missing or unparseable instant', () => {
    expect(formatLogDate(null, NOW)).toBeNull();
    expect(formatLogDate('not a date', NOW)).toBeNull();
  });
});

describe('formatLogDateTime', () => {
  it('appends the time', () => {
    // `\s` rather than a literal space before AM/PM: newer ICU builds separate
    // them with U+202F, and pinning the byte would break on a Node upgrade.
    expect(formatLogDateTime('2026-01-28T09:00:00Z', NOW)).toMatch(
      /^Jan 2[78], \d{1,2}:\d{2}\s[AP]M$/,
    );
  });

  it('returns null for a missing instant', () => {
    expect(formatLogDateTime(null, NOW)).toBeNull();
  });
});

describe('formatRelative', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  it('describes the elapsed time in the largest sensible unit', () => {
    expect(formatRelative(ago(30_000), NOW)).toBe('just now');
    expect(formatRelative(ago(12 * 60_000), NOW)).toBe('12 min ago');
    expect(formatRelative(ago(60 * 60_000), NOW)).toBe('1 hour ago');
    expect(formatRelative(ago(3 * 60 * 60_000), NOW)).toBe('3 hours ago');
    expect(formatRelative(ago(5 * 24 * 60 * 60_000), NOW)).toBe('5 days ago');
  });

  it('keeps `min` singular at every count, matching the mobile app', () => {
    expect(formatRelative(ago(60_000), NOW)).toBe('1 min ago');
    expect(formatRelative(ago(2 * 60_000), NOW)).toBe('2 min ago');
  });

  it('clamps a future timestamp rather than counting backwards', () => {
    // Clock skew between a beacon, the server and this browser is routine.
    expect(formatRelative(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe('just now');
  });

  it('returns null for a missing instant', () => {
    expect(formatRelative(null, NOW)).toBeNull();
  });
});
