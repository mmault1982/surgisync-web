import { describe, expect, it } from 'vitest';

import type { TransferTarget } from '@/api/generated/model';

import {
  buildTransferBody,
  currentAssignment,
  fromDateInput,
  ORGANIZATION,
  requiresLabelPhoto,
  seedTransferForm,
  targetKey,
  toDateInput,
  toTargets,
  transferFieldErrors,
  validateTransferForm,
  withCurrentAssignment,
  type TransferFormValues,
} from '../transfer';

import { kitFixture } from './kit-fixture';

const REP: TransferTarget = { type: 'representative', id: 3, name: 'John Smith' };
const FACILITY: TransferTarget = { type: 'facility', id: 7, name: "St Mary's Hospital" };

function form(overrides: Partial<TransferFormValues> = {}): TransferFormValues {
  return {
    ...seedTransferForm(kitFixture(), new Date(2026, 3, 22)),
    toKey: targetKey(FACILITY),
    transport: 'rep',
    kitPhoto: { file: new File(['x'], 'kit.jpg'), previewUrl: 'blob:kit' },
    ...overrides,
  };
}

describe('targets', () => {
  it('keys by type and id, so colliding ids stay distinct', () => {
    const rep: TransferTarget = { type: 'representative', id: 4, name: 'Ada' };
    const facility: TransferTarget = { type: 'facility', id: 4, name: 'Mercy' };

    expect(targetKey(rep)).not.toBe(targetKey(facility));
  });

  it('writes the representative column for a representative', () => {
    const targets = toTargets([REP, FACILITY]);

    const body = buildTransferBody(kitFixture(), form({ toKey: targetKey(REP) }), targets);

    expect(body.to_assigned_to_representative).toBe(3);
    expect(body).not.toHaveProperty('to_assigned_to_facility');
    expect(body).not.toHaveProperty('to_assigned_to_parent_company');
  });

  it('writes the facility column for a facility', () => {
    const targets = toTargets([REP, FACILITY]);

    const body = buildTransferBody(kitFixture(), form({ toKey: targetKey(FACILITY) }), targets);

    expect(body.to_assigned_to_facility).toBe(7);
    expect(body).not.toHaveProperty('to_assigned_to_representative');
  });

  it('resolves a rep and a facility that share an id to different columns', () => {
    const rep: TransferTarget = { type: 'representative', id: 4, name: 'Ada' };
    const facility: TransferTarget = { type: 'facility', id: 4, name: 'Mercy' };
    const targets = toTargets([rep, facility]);

    const toRep = buildTransferBody(kitFixture(), form({ toKey: targetKey(rep) }), targets);
    const toFacility = buildTransferBody(
      kitFixture(),
      form({ toKey: targetKey(facility) }),
      targets,
    );

    expect(toRep.to_assigned_to_representative).toBe(4);
    expect(toRep).not.toHaveProperty('to_assigned_to_facility');
    expect(toFacility.to_assigned_to_facility).toBe(4);
    expect(toFacility).not.toHaveProperty('to_assigned_to_representative');
  });
});

describe('currentAssignment', () => {
  it('reads the representative when one holds the kit', () => {
    expect(currentAssignment(kitFixture())).toEqual({
      type: 'representative',
      id: 3,
      name: 'John Smith',
    });
  });

  it('reads the facility when no representative holds it', () => {
    const kit = kitFixture({
      assigned_to_representative: null,
      assigned_to_name: null,
      assigned_to_facility: 7,
      assigned_to_facility_name: "St Mary's Hospital",
    });

    expect(currentAssignment(kit)).toEqual({
      type: 'facility',
      id: 7,
      name: "St Mary's Hospital",
    });
  });

  it('reads the organization last, and names it only when it owns the kit', () => {
    const owned = kitFixture({
      assigned_to_representative: null,
      assigned_to_name: null,
      assigned_to_parent_company: 1,
    });
    const elsewhere = kitFixture({
      assigned_to_representative: null,
      assigned_to_name: null,
      assigned_to_parent_company: 99,
    });

    expect(currentAssignment(owned)).toEqual({
      type: ORGANIZATION,
      id: 1,
      name: 'Hoosier OsteoTronix',
    });
    // No assigned_to_parent_company_name on the serializer to fall back to.
    expect(currentAssignment(elsewhere)?.name).toBe('Current organization');
  });

  it('is null for an unassigned kit', () => {
    const kit = kitFixture({ assigned_to_representative: null, assigned_to_name: null });

    expect(currentAssignment(kit)).toBeNull();
  });

  it('writes the parent-company column, not a facility one', () => {
    const kit = kitFixture({
      assigned_to_representative: null,
      assigned_to_name: null,
      assigned_to_parent_company: 1,
    });
    const current = currentAssignment(kit);
    const targets = withCurrentAssignment(toTargets([REP]), current);

    const body = buildTransferBody(kit, form({ fromKey: targetKey(current!) }), targets);

    expect(body.from_assigned_to_parent_company).toBe(1);
    expect(body).not.toHaveProperty('from_assigned_to_facility');
  });
});

describe('withCurrentAssignment', () => {
  it('injects a holder the fetched list does not offer', () => {
    const options = withCurrentAssignment(toTargets([FACILITY]), {
      type: 'representative',
      id: 3,
      name: 'John Smith',
    });

    expect(options.map((option) => option.name)).toEqual(['John Smith', "St Mary's Hospital"]);
  });

  it('does not duplicate a holder the list already offers', () => {
    const options = withCurrentAssignment(toTargets([REP, FACILITY]), {
      type: 'representative',
      id: 3,
      name: 'John Smith',
    });

    expect(options).toHaveLength(2);
  });

  it('passes the list through when nothing holds the kit', () => {
    expect(withCurrentAssignment(toTargets([REP]), null)).toHaveLength(1);
  });
});

describe('seedTransferForm', () => {
  it('pre-fills From from the kit and leaves To empty', () => {
    const values = seedTransferForm(kitFixture(), new Date(2026, 3, 22));

    expect(values.fromKey).toBe('representative:3');
    expect(values.toKey).toBeNull();
  });

  it('defaults to Surgery, today, and no transport method', () => {
    const values = seedTransferForm(kitFixture(), new Date(2026, 3, 22));

    expect(values.reason).toBe('surgery');
    expect(values.transferDate).toBe('2026-04-22');
    expect(values.transport).toBeNull();
  });
});

describe('dates', () => {
  it('formats a local calendar day, not a UTC instant', () => {
    // 00:30 local on the 22nd is still the 21st in UTC anywhere west of
    // Greenwich; toISOString would render the wrong day.
    expect(toDateInput(new Date(2026, 3, 22, 0, 30))).toBe('2026-04-22');
  });

  it('round-trips through the calendar without shifting a day', () => {
    const parsed = fromDateInput('2026-04-22');

    expect(parsed && toDateInput(parsed)).toBe('2026-04-22');
    expect(parsed?.getDate()).toBe(22);
  });

  it('is undefined for an unparseable value', () => {
    expect(fromDateInput('')).toBeUndefined();
  });
});

describe('photo requirements', () => {
  it('wants a shipping label for carriers only', () => {
    expect(requiresLabelPhoto('fedex')).toBe(true);
    expect(requiresLabelPhoto('ups')).toBe(true);
    expect(requiresLabelPhoto('rep')).toBe(false);
    expect(requiresLabelPhoto(null)).toBe(false);
  });

  it('requires a kit photo for every method', () => {
    expect(validateTransferForm(form({ transport: 'rep', kitPhoto: null })).photos).toBe(
      'A kit photo is required',
    );
    expect(
      validateTransferForm(form({ transport: 'fedex', kitPhoto: null, labelPhoto: null })).photos,
    ).toBe('A kit photo is required');
  });

  it('requires a label photo once a carrier is chosen', () => {
    expect(validateTransferForm(form({ transport: 'ups' })).photos).toBe(
      'A shipping label photo is required',
    );
  });

  it('asks for no photos before a method is chosen', () => {
    const errors = validateTransferForm(form({ transport: null, kitPhoto: null }));

    expect(errors.transport).toBe('Please select a transport method');
    expect(errors.photos).toBeUndefined();
  });

  it('never sends a label photo for a method that does not want one', () => {
    const values = form({
      transport: 'rep',
      labelPhoto: { file: new File(['x'], 'label.jpg'), previewUrl: 'blob:label' },
    });

    expect(buildTransferBody(kitFixture(), values, toTargets([FACILITY]))).not.toHaveProperty(
      'label_photo',
    );
  });
});

describe('validation', () => {
  it('needs both ends of the route', () => {
    expect(validateTransferForm(form({ toKey: null })).to).toBe(
      'Please select where to transfer to',
    );
    expect(validateTransferForm(form({ fromKey: null })).from).toBe(
      'Select where the kit is transferring from',
    );
  });

  it('passes a complete rep transfer', () => {
    expect(validateTransferForm(form())).toEqual({});
  });
});

describe('buildTransferBody', () => {
  it('sends stock_items as an array of one and never the deprecated alias', () => {
    const body = buildTransferBody(kitFixture({ id: 42 }), form(), toTargets([FACILITY]));

    expect(body.stock_items).toEqual([42]);
    expect(body).not.toHaveProperty('inventory_kits');
  });

  it('never sends is_draft', () => {
    expect(buildTransferBody(kitFixture(), form(), toTargets([FACILITY]))).not.toHaveProperty(
      'is_draft',
    );
  });

  it('omits blank notes rather than sending null', () => {
    const body = buildTransferBody(kitFixture(), form({ notes: '   ' }), toTargets([FACILITY]));

    expect(body).not.toHaveProperty('notes');
  });

  it('trims notes that have content', () => {
    const body = buildTransferBody(
      kitFixture(),
      form({ notes: '  fragile  ' }),
      toTargets([FACILITY]),
    );

    expect(body.notes).toBe('fragile');
  });

  it('sends the date as YYYY-MM-DD', () => {
    const body = buildTransferBody(kitFixture(), form(), toTargets([FACILITY]));

    expect(body.transfer_date).toBe('2026-04-22');
  });
});

describe('transferFieldErrors', () => {
  function badRequest(data: Record<string, string[]>) {
    return {
      isAxiosError: true,
      response: { status: 400, data },
    };
  }

  it('routes an in-transit rejection to the To field', () => {
    const errors = transferFieldErrors(
      badRequest({
        stock_items: ['These stock items are already in transit under another transfer: [42].'],
      }),
    );

    expect(errors.to).toContain('already in transit');
  });

  it('shows the dual-reported required error once, not twice', () => {
    // The serializer reports it under both names by design, so a client on
    // either spelling sees it.
    const errors = transferFieldErrors(
      badRequest({
        stock_items: ['This field is required.'],
        inventory_kits: ['This field is required.'],
      }),
    );

    expect(errors.to).toBe('This field is required.');
  });

  it('routes each side to its own field', () => {
    const errors = transferFieldErrors(
      badRequest({
        from_assigned_to_representative: ['Invalid pk "9" - object does not exist.'],
        to_assigned_to_facility: ['Invalid pk "8" - object does not exist.'],
      }),
    );

    expect(errors.from).toContain('Invalid pk "9"');
    expect(errors.to).toContain('Invalid pk "8"');
  });

  it('ignores an error shape that is not the field map', () => {
    expect(transferFieldErrors(new Error('boom'))).toEqual({});
  });
});
