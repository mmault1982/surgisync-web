import { describe, expect, it } from 'vitest';

import type { InventoryKitDetail, InventoryKitList } from '@/api/generated/model';

import { isExpired, statusLabels, stripeTone, trackerState } from '../stock-status';

import { trackerFixture } from './kit-fixture';

/**
 * The prototype stores `stripe` as a literal string per row and never computes
 * it, so there is no rule to copy — the one under test is reverse-engineered
 * from its legend plus its eight sample rows. These cases are those rows.
 */
function row(overrides: Partial<InventoryKitList> = {}): InventoryKitList {
  return {
    id: 1,
    part: 1,
    part_uuid: 'x',
    part_name: 'Kit',
    part_kind: 'kit',
    is_serialized: true,
    kit: 1,
    kit_uuid: 'x',
    kit_name: 'Kit',
    quantity: 1,
    manufacturer_kit_id: 'ABC-1',
    lot_code: null,
    udi: null,
    parent_company_name: 'Org',
    manufacturer_id: 1,
    manufacturer_name: 'Treace',
    ownership_type: 'owned',
    assigned_to_representative: null,
    assigned_to_name: null,
    assigned_to_facility: null,
    assigned_to_facility_name: null,
    physical_location: 'Shelf A',
    loaner_due_date: null,
    expiration_date: null,
    last_sterilized_at: null,
    is_complete: true,
    is_wrapped: false,
    is_signed_in: true,
    is_returned: false,
    is_lost: false,
    is_other: false,
    active_transfer_id: null,
    active_transfer_destination_name: null,
    photo: null,
    photo_count: 0,
    tracker: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const TODAY = new Date('2026-04-22T12:00:00Z');

describe('stripe tone', () => {
  it('is red when expired, even if the kit is complete', () => {
    // The prototype's TRC-LAP-2100: Complete, but expired, and striped red.
    // This is what makes "worst state wins" the rule rather than "first match".
    expect(stripeTone(row({ is_complete: true, expiration_date: '2026-01-01' }), TODAY)).toBe(
      'red',
    );
  });

  it('is red when lost or incomplete', () => {
    expect(stripeTone(row({ is_lost: true }), TODAY)).toBe('red');
    expect(stripeTone(row({ is_complete: false }), TODAY)).toBe('red');
  });

  it('is amber when in transit, even if the kit is complete', () => {
    // STR-TRI-5500: Complete and in transit, striped amber.
    expect(stripeTone(row({ is_complete: true, active_transfer_id: 7 }), TODAY)).toBe('amber');
  });

  it('is amber for the catch-all other flag', () => {
    expect(stripeTone(row({ is_other: true }), TODAY)).toBe('amber');
  });

  it('is neutral when signed out', () => {
    expect(stripeTone(row({ is_signed_in: false }), TODAY)).toBe('neutral');
  });

  it('is green for a complete, signed-in, unexpired kit', () => {
    expect(stripeTone(row(), TODAY)).toBe('green');
  });

  it('applies red over amber when both would match', () => {
    expect(stripeTone(row({ is_lost: true, active_transfer_id: 7 }), TODAY)).toBe('red');
  });
});

describe('expiry', () => {
  it('does not treat today as expired', () => {
    expect(isExpired(row({ expiration_date: '2026-04-22' }), TODAY)).toBe(false);
  });

  it('treats yesterday as expired', () => {
    expect(isExpired(row({ expiration_date: '2026-04-21' }), TODAY)).toBe(true);
  });

  it('treats no expiry as not expired', () => {
    expect(isExpired(row({ expiration_date: null }), TODAY)).toBe(false);
  });
});

describe('status labels', () => {
  it('always states complete or incomplete', () => {
    expect(statusLabels(row({ is_complete: true }))).toContain('Complete');
    expect(statusLabels(row({ is_complete: false }))).toContain('Incomplete');
  });

  it('lists every set flag', () => {
    const labels = statusLabels(
      row({ is_complete: true, is_wrapped: true, is_lost: true, is_signed_in: true }),
    );
    expect(labels).toEqual(['Complete', 'Wrapped', 'Signed In', 'Lost']);
  });
});

describe('tracker state', () => {
  it('distinguishes tracked, pairing and untracked', () => {
    expect(trackerState(row({ tracker: null }))).toBe('untracked');
    expect(
      trackerState(row({ tracker: trackerFixture({ id: 1, beacon_id: 'HM-1', is_active: true }) })),
    ).toBe('tracked');
    expect(
      trackerState(
        row({ tracker: trackerFixture({ id: 1, beacon_id: 'HM-1', is_active: false }) }),
      ),
    ).toBe('pairing');
  });
});

describe('the detail record', () => {
  /**
   * Kit Detail runs these same rules over `InventoryKitDetail`, which declares
   * the status booleans and `expiration_date` as *optional* because the same
   * serializer handles writes. A parameter typed as `InventoryKitList` rejects
   * it, which is why `StockStatusFields` exists.
   *
   * This case is the guard: narrowing the helpers back to a list row stops the
   * detail screen compiling, for a reason that is not obvious from the error.
   */
  it('is accepted, reading an absent flag as false', () => {
    const detail = {
      is_complete: undefined,
      active_transfer_id: null,
      tracker: null,
    } satisfies Partial<InventoryKitDetail> as InventoryKitDetail;

    expect(statusLabels(detail)).toEqual(['Incomplete']);
    expect(stripeTone(detail, TODAY)).toBe('red');
    expect(isExpired(detail, TODAY)).toBe(false);
  });
});
