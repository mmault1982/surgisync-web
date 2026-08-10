import type { InventoryKitDetail, InventoryKitHistory, TrackingEvent } from '@/api/generated/model';

/**
 * Fixtures for the Kit Detail tests.
 *
 * Not a `.test.ts`, so Vitest's include pattern leaves it alone. The values are
 * the prototype's TRC-MTP-2200 row, which is also the kit in the design mock —
 * so a failure message names something recognisable.
 */

export function kitFixture(overrides: Partial<InventoryKitDetail> = {}): InventoryKitDetail {
  return {
    id: 1,
    parent_company: 1,
    parent_company_name: 'Hoosier OsteoTronix',
    part: 1,
    part_uuid: 'x',
    part_name: 'MTP Fusion Plate',
    part_kind: 'kit',
    is_serialized: true,
    kit: 1,
    kit_uuid: 'x',
    kit_name: 'MTP Fusion Plate',
    quantity: 1,
    manufacturer_kit_id: 'TRC-MTP-2200',
    lot_code: 'LOT-2025-1290',
    udi: null,
    manufacturer_id: 1,
    manufacturer_name: 'Treace',
    assigned_to_parent_company: null,
    assigned_to_representative: 3,
    assigned_to_name: 'John Smith',
    assigned_to_facility: null,
    assigned_to_facility_name: null,
    physical_location: 'Rep Vehicle',
    ownership_type: 'loaned',
    loaner_due_date: null,
    expiration_date: '2027-03-01',
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
    photos: [],
    photo_count: 0,
    tracker: null,
    notes: null,
    is_draft: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function historyFixture(overrides: Partial<InventoryKitHistory> = {}): InventoryKitHistory {
  return {
    history_id: 1,
    history_date: '2026-01-28T09:00:00Z',
    history_type: '~',
    history_user: { id: 1, name: 'Brad' },
    changes: [],
    history_summary: 'Status → Complete',
    ...overrides,
  };
}

export function eventFixture(overrides: Partial<TrackingEvent> = {}): TrackingEvent {
  return {
    id: 1,
    event_type: 'entered_location',
    occurred_at: '2026-04-22T11:50:00Z',
    latitude: '39.768400',
    longitude: '-86.158100',
    location_name: 'Example Hospital',
    location_city: 'Indianapolis',
    location_state: 'IN',
    location_country: 'US',
    beacon_identifier: 'HSL-99887',
    asset_name: 'Tray 12',
    user_name: '',
    ...overrides,
  };
}
