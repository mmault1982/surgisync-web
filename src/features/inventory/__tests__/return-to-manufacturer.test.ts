import { describe, expect, it } from 'vitest';

import {
  buildReturnBody,
  composeReturnNotes,
  returnErrorMessage,
  returnFieldErrors,
  seedReturnForm,
  validateReturnForm,
  type ReturnFormValues,
} from '../return-to-manufacturer';

import { kitFixture } from './kit-fixture';

function form(overrides: Partial<ReturnFormValues> = {}): ReturnFormValues {
  return {
    ...seedReturnForm(kitFixture()),
    returnReason: 'Damaged',
    transport: 'ups',
    kitPhoto: { file: new File(['x'], 'kit.jpg'), previewUrl: 'blob:kit' },
    labelPhoto: { file: new File(['x'], 'label.jpg'), previewUrl: 'blob:label' },
    ...overrides,
  };
}

const TODAY = new Date(2026, 3, 22);

describe('seedReturnForm', () => {
  it('seeds the condition from the kit', () => {
    expect(seedReturnForm(kitFixture({ is_complete: true })).isComplete).toBe(true);
    expect(seedReturnForm(kitFixture({ is_complete: false })).isComplete).toBe(false);
  });

  it('treats an absent flag as complete, the way the list does', () => {
    expect(seedReturnForm(kitFixture({ is_complete: undefined })).isComplete).toBe(true);
  });

  it('starts with no reason and no transport method', () => {
    const values = seedReturnForm(kitFixture());

    expect(values.returnReason).toBe('');
    expect(values.transport).toBeNull();
  });
});

describe('composeReturnNotes', () => {
  it('folds the reason and condition into one line', () => {
    expect(composeReturnNotes(form({ returnReason: 'Damaged', isComplete: true }))).toBe(
      'Return reason: Damaged · Condition: Complete',
    );
  });

  it('says Incomplete when the condition says so', () => {
    expect(composeReturnNotes(form({ returnReason: 'Expired', isComplete: false }))).toBe(
      'Return reason: Expired · Condition: Incomplete',
    );
  });

  it('appends free-text notes after a blank line', () => {
    const notes = composeReturnNotes(form({ returnReason: 'Damaged', notes: 'Dented lid' }));

    expect(notes).toBe('Return reason: Damaged · Condition: Complete\n\nDented lid');
  });

  it('adds no trailing blank line when there are no extra notes', () => {
    expect(composeReturnNotes(form({ notes: '   ' }))).not.toContain('\n');
  });

  it('trims both halves', () => {
    expect(composeReturnNotes(form({ returnReason: '  Damaged  ', notes: '  Dented  ' }))).toBe(
      'Return reason: Damaged · Condition: Complete\n\nDented',
    );
  });
});

describe('buildReturnBody', () => {
  it('sends the return reason enum, never the free text', () => {
    const body = buildReturnBody(kitFixture(), form({ returnReason: 'Damaged' }), TODAY);

    expect(body.reason).toBe('return');
    expect(body.notes).toContain('Damaged');
  });

  it('names the owning organization and neither of the other two columns', () => {
    // That absence *is* the definition of a return: name a rep or a facility
    // and the kits land with a new holder instead of leaving inventory.
    const body = buildReturnBody(kitFixture({ parent_company: 4 }), form(), TODAY);

    expect(body.to_assigned_to_parent_company).toBe(4);
    expect(body).not.toHaveProperty('to_assigned_to_representative');
    expect(body).not.toHaveProperty('to_assigned_to_facility');
  });

  it('omits the destination entirely when the kit has no owning organization', () => {
    const body = buildReturnBody(kitFixture({ parent_company: null }), form(), TODAY);

    expect(body).not.toHaveProperty('to_assigned_to_parent_company');
    expect(body).not.toHaveProperty('to_assigned_to_representative');
    expect(body).not.toHaveProperty('to_assigned_to_facility');
  });

  it('carries the kit’s current holder on the from side', () => {
    const body = buildReturnBody(kitFixture(), form(), TODAY);

    expect(body.from_assigned_to_representative).toBe(3);
  });

  it('sends one stock item and never the deprecated alias', () => {
    const body = buildReturnBody(kitFixture({ id: 42 }), form(), TODAY);

    expect(body.stock_items).toEqual([42]);
    expect(body).not.toHaveProperty('inventory_kits');
  });

  it('stamps today as the transfer date', () => {
    expect(buildReturnBody(kitFixture(), form(), TODAY).transfer_date).toBe('2026-04-22');
  });

  it('sends both photos even for rep transport', () => {
    const body = buildReturnBody(kitFixture(), form({ transport: 'rep' }), TODAY);

    expect(body.kit_photo).toBeDefined();
    expect(body.label_photo).toBeDefined();
  });

  it('never sends is_draft', () => {
    expect(buildReturnBody(kitFixture(), form(), TODAY)).not.toHaveProperty('is_draft');
  });
});

describe('validateReturnForm', () => {
  it('requires a reason', () => {
    expect(validateReturnForm(form({ returnReason: '   ' })).returnReason).toBe(
      'Please enter a reason for the return',
    );
  });

  it('requires a transport method', () => {
    expect(validateReturnForm(form({ transport: null })).transport).toBe(
      'Please select a transport method',
    );
  });

  it('requires a shipping label for EVERY method, rep transport included', () => {
    // The divergence from Transfer, where the label is carrier-only. A return
    // always ships to the manufacturer.
    for (const transport of ['rep', 'fedex', 'ups'] as const) {
      expect(validateReturnForm(form({ transport, labelPhoto: null })).photos).toBe(
        'A shipping label photo is required',
      );
    }
  });

  it('asks for the kit photo before the label', () => {
    expect(validateReturnForm(form({ kitPhoto: null, labelPhoto: null })).photos).toBe(
      'A kit photo is required',
    );
  });

  it('asks for no photos before a method is chosen', () => {
    const errors = validateReturnForm(form({ transport: null, kitPhoto: null, labelPhoto: null }));

    expect(errors.photos).toBeUndefined();
  });

  it('passes a complete form', () => {
    expect(validateReturnForm(form())).toEqual({});
  });
});

describe('server errors', () => {
  function badRequest(data: Record<string, string[]>) {
    return { isAxiosError: true, response: { status: 400, data } };
  }

  it('slots a transport rejection under its field', () => {
    expect(
      returnFieldErrors(badRequest({ transport_method: ['"x" is not a valid choice.'] })).transport,
    ).toContain('not a valid choice');
  });

  it('surfaces an unslotted rejection in the form-level alert', () => {
    // There is no field on this form for the kit set, so an "already in
    // transit" error has to reach the alert rather than vanish.
    const error = badRequest({
      stock_items: ['These stock items are already in transit under another transfer: [1].'],
    });

    expect(returnFieldErrors(error)).toEqual({});
    expect(returnErrorMessage(error)).toContain('already in transit');
  });

  it('surfaces a route rejection too, since this form has no From or To', () => {
    const error = badRequest({
      to_assigned_to_parent_company: ['Invalid pk "9" - object does not exist.'],
    });

    expect(returnErrorMessage(error)).toContain('Invalid pk "9"');
  });

  it('falls back to the house copy for a non-field error', () => {
    expect(returnErrorMessage(new Error('boom'))).toBeTruthy();
  });
});
