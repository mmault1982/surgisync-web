import type {
  InventoryKitDetail,
  InventoryKitHistory,
  InventoryKitPhoto,
  InventoryTransferDetail,
  KitTracker,
  TrackingEvent,
} from '@/api/generated/model';

/**
 * Fixtures for the Kit Detail tests.
 *
 * Not a `.test.ts`, so Vitest's include pattern leaves it alone. The values are
 * the prototype's TRC-MTP-2200 row, which is also the kit in the design mock —
 * so a failure message names something recognisable.
 */

/**
 * An attached tracker.
 *
 * A helper rather than an inline literal because `KitTracker`'s read fields are
 * all `required`, so every field the backend adds breaks every literal at once
 * — which is exactly what the Hansel sync fields did to three test files.
 */
export function trackerFixture(overrides: Partial<KitTracker> = {}): KitTracker {
  return {
    id: 7,
    beacon_id: 'HSL-99887',
    is_active: true,
    sync_state: 'not_synced',
    sync_error: '',
    synced_at: null,
    ...overrides,
  };
}

/**
 * One attached photo.
 *
 * A helper for the same reason `trackerFixture` is one: `InventoryKitPhoto`'s
 * read fields are all `required`, so an inline literal breaks everywhere at
 * once the day the serializer grows a field.
 */
export function photoFixture(overrides: Partial<InventoryKitPhoto> = {}): InventoryKitPhoto {
  return {
    id: 1,
    url: 'https://example.test/1.png',
    created_at: '2026-01-28T09:00:00Z',
    ...overrides,
  };
}

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

/**
 * A pending transfer: TRC-MTP-2200 moving from its rep to a hospital.
 *
 * The `to_*` pair is what decides whether confirming it hands the kit over or
 * removes it from inventory, so most callers override exactly that.
 */
export function transferFixture(
  overrides: Partial<InventoryTransferDetail> = {},
): InventoryTransferDetail {
  return {
    id: 12,
    stock_items: [1],
    transport_method: 'fedex',
    reason: 'surgery',
    transfer_date: '2026-04-22',
    notes: null,
    from_assigned_to_parent_company: null,
    from_parent_company_name: null,
    from_assigned_to_representative: 3,
    from_representative_name: 'John Smith',
    from_assigned_to_facility: null,
    from_facility_name: null,
    to_assigned_to_parent_company: null,
    to_parent_company_name: null,
    to_assigned_to_representative: null,
    to_representative_name: null,
    to_assigned_to_facility: 7,
    to_facility_name: "St Mary's Hospital",
    kit_photo: null,
    label_photo: null,
    created_at: '2026-04-22T09:00:00Z',
    ...overrides,
  };
}
