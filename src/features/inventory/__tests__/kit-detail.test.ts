import { describe, expect, it } from 'vitest';

import {
  addressLine,
  bannerState,
  currentPosition,
  eventPosition,
  historyActor,
  kitFields,
  ownershipLabel,
  parseCoordinate,
} from '../kit-detail';

import { eventFixture as event, kitFixture as kit } from './kit-fixture';

const TODAY = new Date('2026-04-22T12:00:00Z');

describe('kitFields', () => {
  it('lists the seven fields in the prototype order', () => {
    expect(kitFields(kit(), TODAY).map((field) => field.label)).toEqual([
      'Manufacturer',
      'Status',
      'Lot #',
      'Expiration',
      'Rep / Assigned To',
      'Physical Location',
      'Entity',
    ]);
  });

  it('has no Site field', () => {
    // Pinned deliberately: the prototype's SITE cell is demo data with nothing
    // behind it, and re-adding it would mean inventing product semantics.
    expect(kitFields(kit(), TODAY).map((field) => field.label)).not.toContain('Site');
  });

  it('formats the expiry as a calendar date, not an instant', () => {
    const expiration = kitFields(kit(), TODAY).find((field) => field.label === 'Expiration');
    expect(expiration?.value).toBe('03-01-2027');
    expect(expiration?.emphasis).toBeUndefined();
  });

  it('marks a past expiry', () => {
    const fields = kitFields(kit({ expiration_date: '2026-01-15' }), TODAY);
    expect(fields.find((field) => field.label === 'Expiration')?.emphasis).toBe('expired');
  });

  it('falls back to the facility when the kit is not assigned to a person', () => {
    const fields = kitFields(
      kit({ assigned_to_name: null, assigned_to_facility_name: "St. Mary's Hospital" }),
      TODAY,
    );
    expect(fields.find((field) => field.label === 'Rep / Assigned To')?.value).toBe(
      "St. Mary's Hospital",
    );
  });

  it('renders an em dash for every empty value', () => {
    const fields = kitFields(
      kit({
        lot_code: null,
        expiration_date: null,
        assigned_to_name: null,
        assigned_to_facility_name: null,
        physical_location: '',
        parent_company_name: null,
      }),
      TODAY,
    );
    const byLabel = Object.fromEntries(fields.map((field) => [field.label, field.value]));
    expect(byLabel['Lot #']).toBe('—');
    expect(byLabel['Expiration']).toBe('—');
    expect(byLabel['Rep / Assigned To']).toBe('—');
    expect(byLabel['Physical Location']).toBe('—');
    expect(byLabel['Entity']).toBe('—');
  });
});

describe('bannerState', () => {
  it('is quiet for a healthy kit', () => {
    expect(bannerState(kit(), TODAY)).toEqual({ expiredOn: null, inTransitTo: null });
  });

  it('reports an expiry with its date', () => {
    expect(bannerState(kit({ expiration_date: '2026-01-15' }), TODAY).expiredOn).toBe('01-15-2026');
  });

  it('reports a transfer with its destination', () => {
    const state = bannerState(
      kit({ active_transfer_id: 9, active_transfer_destination_name: 'Regional Medical' }),
      TODAY,
    );
    expect(state.inTransitTo).toBe('Regional Medical');
  });

  it('still reports a transfer whose destination the API did not name', () => {
    // The banner has to appear; what it must not do is render "In Transit → null".
    const state = bannerState(
      kit({ active_transfer_id: 9, active_transfer_destination_name: null }),
      TODAY,
    );
    expect(state.inTransitTo).toBe(true);
  });

  it('reports both at once', () => {
    const state = bannerState(
      kit({
        expiration_date: '2026-01-15',
        active_transfer_id: 9,
        active_transfer_destination_name: 'Regional Medical',
      }),
      TODAY,
    );
    expect(state).toEqual({ expiredOn: '01-15-2026', inTransitTo: 'Regional Medical' });
  });
});

describe('ownershipLabel', () => {
  it('title-cases the enum', () => {
    expect(ownershipLabel(kit({ ownership_type: 'loaned' }))).toBe('Loaned');
    expect(ownershipLabel(kit({ ownership_type: 'consigned' }))).toBe('Consigned');
  });

  it('is null when the serializer omitted it', () => {
    expect(ownershipLabel(kit({ ownership_type: undefined }))).toBeNull();
  });
});

describe('historyActor', () => {
  const entry = (name: string | null) => ({
    history_id: 1,
    history_date: '2026-01-28T09:00:00Z',
    history_type: '~' as const,
    history_user: name === null ? null : { id: 1, name },
    changes: [],
    history_summary: 'Status → Complete',
  });

  it('names the user who made the change', () => {
    expect(historyActor(entry('Brad'))).toBe('Brad');
  });

  it('attributes an unattributed change to System', () => {
    // Null for changes made before user tracking, or outside a request.
    expect(historyActor(entry(null))).toBe('System');
    expect(historyActor(entry('   '))).toBe('System');
  });
});

describe('parseCoordinate', () => {
  it('parses a decimal string', () => {
    expect(parseCoordinate('39.768400')).toBe(39.7684);
    expect(parseCoordinate('-86.158100')).toBe(-86.1581);
  });

  /**
   * The regression this guard exists for: `Number('')` and `Number(null)` are
   * both 0, so a beacon reporting no fix would plot at 0°N 0°E — in the Gulf of
   * Guinea — instead of saying it has no position.
   */
  it('returns null for a blank or missing value rather than zero', () => {
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('   ')).toBeNull();
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate(undefined)).toBeNull();
  });

  it('returns null for a non-numeric value', () => {
    expect(parseCoordinate('abc')).toBeNull();
  });
});

describe('eventPosition', () => {
  it('pairs a parsed latitude and longitude', () => {
    expect(eventPosition(event())).toEqual([39.7684, -86.1581]);
  });

  it('is null when either half is missing', () => {
    expect(eventPosition(event({ latitude: null }))).toBeNull();
    expect(eventPosition(event({ longitude: null }))).toBeNull();
    expect(eventPosition(undefined)).toBeNull();
  });

  it('rejects a coordinate outside the CRS bounds', () => {
    // The schema's pattern permits three digits; Leaflet throws on them, which
    // would take the whole page down over one bad row.
    expect(eventPosition(event({ latitude: '999' }))).toBeNull();
    expect(eventPosition(event({ longitude: '-181' }))).toBeNull();
  });
});

describe('currentPosition', () => {
  it('takes the newest event, which the endpoint guarantees carries a fix', () => {
    const newest = event({ id: 2, latitude: '40.000000', longitude: '-80.000000' });
    expect(currentPosition([newest, event()])).toEqual([40, -80]);
  });

  it('falls through to the newest event that does have one', () => {
    expect(currentPosition([event({ latitude: null }), event()])).toEqual([39.7684, -86.1581]);
  });

  it('is null when no event has a fix', () => {
    expect(currentPosition([])).toBeNull();
    expect(currentPosition([event({ latitude: null, longitude: null })])).toBeNull();
  });
});

describe('addressLine', () => {
  it('joins the place names it has', () => {
    expect(addressLine(event())).toBe('Example Hospital, Indianapolis, IN');
  });

  it('drops empty parts rather than rendering their separators', () => {
    // These are required strings, so an unknown place is '' — filtering on
    // nullishness would produce ", , ".
    expect(addressLine(event({ location_name: '', location_state: '' }))).toBe('Indianapolis');
  });

  it('is null when the fix has no reverse geocode at all', () => {
    expect(
      addressLine(event({ location_name: '', location_city: '', location_state: '' })),
    ).toBeNull();
    expect(addressLine(undefined)).toBeNull();
  });
});
