import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  FACILITY_DEFAULTS,
  facilitySearchSchema,
  hasActiveFilters,
  toListParams,
} from '../facilities.search';

const parse = (input: unknown) => facilitySearchSchema.parse(input);

describe('facilitySearchSchema', () => {
  it('defaults to the first page and nothing narrowed', () => {
    expect(parse({})).toEqual({ page: 1, page_size: DEFAULT_PAGE_SIZE });
  });

  it('degrades a nonsense page rather than throwing', () => {
    // A hand-edited or stale URL should show the list, not a route error.
    expect(parse({ page: 'nonsense' }).page).toBe(1);
    expect(parse({ page: -4 }).page).toBe(1);
    expect(parse({ page_size: 9999 }).page_size).toBe(DEFAULT_PAGE_SIZE);
  });

  it('keeps a known type and drops an unknown one', () => {
    expect(parse({ facility_type: 'surgery_center' }).facility_type).toBe('surgery_center');
    expect(parse({ facility_type: 'hospice' }).facility_type).toBeUndefined();
  });

  it('does not carry an onboarding filter', () => {
    // The endpoint offers one; this screen deliberately does not. The table
    // still shows the status as a column.
    expect(parse({ onboarding_status: 'completed' })).not.toHaveProperty('onboarding_status');
  });

  describe('is_active', () => {
    it('is absent by default, which the endpoint reads as both', () => {
      expect(parse({}).is_active).toBeUndefined();
    });

    it('carries both booleans', () => {
      expect(parse({ is_active: true }).is_active).toBe(true);
      expect(parse({ is_active: false }).is_active).toBe(false);
    });

    it('reads the two literal strings a hand-typed URL can carry', () => {
      expect(parse({ is_active: 'true' }).is_active).toBe(true);
      expect(parse({ is_active: 'false' }).is_active).toBe(false);
    });

    it('falls back to "both" rather than inverting on anything else', () => {
      // The whole reason this field does not use `on-hand.search.ts`'s
      // `z.coerce.boolean()`: `Boolean('False')` is `true`, so a mangled URL
      // would answer "show me the deactivated ones" with the active ones.
      for (const value of ['False', 'no', 'nope', '0', 1, {}]) {
        expect(parse({ is_active: value }).is_active).toBeUndefined();
      }
    });
  });
});

describe('hasActiveFilters', () => {
  it('is false for the defaults', () => {
    expect(hasActiveFilters(FACILITY_DEFAULTS)).toBe(false);
  });

  it('is true for any one of the three', () => {
    expect(hasActiveFilters({ ...FACILITY_DEFAULTS, search: 'mercy' })).toBe(true);
    expect(hasActiveFilters({ ...FACILITY_DEFAULTS, facility_type: 'clinic' })).toBe(true);
    expect(hasActiveFilters({ ...FACILITY_DEFAULTS, is_active: true })).toBe(true);
  });

  it('counts "deactivated only" as a filter', () => {
    // `false` is a narrowing, not an absent value — and `Boolean(false)` is
    // the trap this asserts against.
    expect(hasActiveFilters({ ...FACILITY_DEFAULTS, is_active: false })).toBe(true);
  });
});

describe('toListParams', () => {
  it('passes the search state through under the wire names', () => {
    expect(
      toListParams({
        page: 2,
        page_size: 50,
        search: 'mercy',
        facility_type: 'clinic',
        is_active: false,
      }),
    ).toEqual({
      page: 2,
      page_size: 50,
      search: 'mercy',
      facility_type: 'clinic',
      is_active: false,
    });
  });
});
