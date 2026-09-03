import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  beaconConflictMessage,
  buildCreateBody,
  hasErrors,
  initialValues,
  locationOptions,
  MAX_KIT_ID_LENGTH,
  receiveFieldErrors,
  saveErrorMessage,
  validateReceiveKit,
  type ReceiveKitValues,
  type StagedPhoto,
} from '../receive-kit';

/**
 * The Receive form's rules, driven directly.
 *
 * The payload shape is the part with the most ways to be quietly wrong — a
 * field sent that should not be, or a value sent untrimmed — and none of it
 * needs a render.
 */

function photo(key: string): StagedPhoto {
  return {
    key,
    file: new File(['x'], `${key}.png`, { type: 'image/png' }),
    previewUrl: `blob:${key}`,
  };
}

/** A form filled in well enough to submit. */
function filled(overrides: Partial<ReceiveKitValues> = {}): ReceiveKitValues {
  return {
    ...initialValues(),
    manufacturerId: 5,
    representativeId: 12,
    physicalLocation: 'Warehouse',
    partId: 314,
    kitId: 'TRC-LAP-2100',
    ...overrides,
  };
}

/** An axios error carrying `body` at `status`, as the interceptor would throw. */
function apiError(status: number, body: unknown) {
  const error = new AxiosError('failed');
  error.response = {
    data: body,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('validateReceiveKit', () => {
  it('accepts a complete form', () => {
    expect(hasErrors(validateReceiveKit(filled(), [photo('a')]))).toBe(false);
  });

  it('requires every selection and the kit id', () => {
    const errors = validateReceiveKit(initialValues(), []);
    expect(errors.manufacturer).toBeTruthy();
    expect(errors.representative).toBeTruthy();
    expect(errors.location).toBeTruthy();
    expect(errors.part).toBeTruthy();
    expect(errors.kitId).toBeTruthy();
  });

  it('rejects a whitespace-only kit id', () => {
    // The server would take "   " into the CharField happily, and the kit comes
    // back with an id nobody can scan or search for.
    const errors = validateReceiveKit(filled({ kitId: '   ' }), [photo('a')]);
    expect(errors.kitId).toBeTruthy();
  });

  it('rejects a kit id past the contract length', () => {
    const errors = validateReceiveKit(filled({ kitId: 'x'.repeat(MAX_KIT_ID_LENGTH + 1) }), [
      photo('a'),
    ]);
    expect(errors.kitId).toBeTruthy();
  });

  it('allows no photos and at most ten', () => {
    const ten = Array.from({ length: 10 }, (_, i) => photo(`p${i}`));
    expect(validateReceiveKit(filled(), []).photos).toBeUndefined();
    expect(validateReceiveKit(filled(), ten).photos).toBeUndefined();
    expect(validateReceiveKit(filled(), [...ten, photo('p10')]).photos).toBeTruthy();
  });

  it('does not require notes or a beacon', () => {
    const errors = validateReceiveKit(filled({ notes: '', beaconId: '' }), [photo('a')]);
    expect(errors.notes).toBeUndefined();
    expect(errors.beacon).toBeUndefined();
  });
});

describe('buildCreateBody', () => {
  it('sends part, never the deprecated kit alias', () => {
    const body = buildCreateBody(filled());
    expect(body.part).toBe(314);
    expect(body).not.toHaveProperty('kit');
  });

  it('omits quantity and is_draft', () => {
    // quantity defaults to 1 and the serializer rejects anything else for a
    // serialized part; is_draft defaults to false. Sending either can only
    // match the default or 400.
    const body = buildCreateBody(filled());
    expect(body).not.toHaveProperty('quantity');
    expect(body).not.toHaveProperty('is_draft');
  });

  it('never sends a photo', () => {
    // create_inventory_kit declares application/json first, so the generated
    // client posts JSON and a File here would vanish without an error.
    expect(buildCreateBody(filled())).not.toHaveProperty('photo');
  });

  it('sends is_complete and no other status flag', () => {
    const body = buildCreateBody(filled({ isComplete: false }));
    expect(body.is_complete).toBe(false);
    for (const flag of ['is_wrapped', 'is_signed_in', 'is_returned', 'is_lost', 'is_other']) {
      expect(body).not.toHaveProperty(flag);
    }
  });

  it('trims the kit id and the location', () => {
    const body = buildCreateBody(filled({ kitId: '  TRC-1  ', physicalLocation: ' Warehouse ' }));
    expect(body.manufacturer_kit_id).toBe('TRC-1');
    expect(body.physical_location).toBe('Warehouse');
  });

  it('omits notes and beacon_id when blank, and trims them when not', () => {
    const blank = buildCreateBody(filled({ notes: '   ', beaconId: '  ' }));
    expect(blank).not.toHaveProperty('notes');
    expect(blank).not.toHaveProperty('beacon_id');

    const set = buildCreateBody(filled({ notes: ' looks fine ', beaconId: ' HSL-1 ' }));
    expect(set.notes).toBe('looks fine');
    expect(set.beacon_id).toBe('HSL-1');
  });

  it('carries the ownership type', () => {
    expect(buildCreateBody(filled({ ownershipType: 'loaned' })).ownership_type).toBe('loaned');
  });
});

describe('receiveFieldErrors', () => {
  it('routes each rejected field to its slot', () => {
    const errors = receiveFieldErrors(
      apiError(400, {
        part: ['Invalid pk.'],
        manufacturer_kit_id: ['Too long.'],
        physical_location: ['Required.'],
      }),
    );
    expect(errors.part).toBe('Invalid pk.');
    expect(errors.kitId).toBe('Too long.');
    expect(errors.location).toBe('Required.');
  });

  it('routes the deprecated kit alias to the Kit Name slot', () => {
    expect(receiveFieldErrors(apiError(400, { kit: ['Invalid pk.'] })).part).toBe('Invalid pk.');
  });

  it('drops fields with no slot, leaving them to the form-level alert', () => {
    expect(receiveFieldErrors(apiError(400, { parent_company: ['No org.'] }))).toEqual({});
  });
});

describe('saveErrorMessage', () => {
  it('surfaces a rejected field that has no slot on this form', () => {
    // Real and reachable: a user in no organization gets exactly this from
    // perform_create, and nothing on the form could show it.
    const message = saveErrorMessage(
      apiError(400, {
        parent_company: ['Your account is not linked to an organization.'],
      }),
    );
    expect(message).toBe('Your account is not linked to an organization.');
  });

  it('falls back to the house copy for anything else', () => {
    expect(saveErrorMessage(apiError(500, {}))).toBe('Something went wrong. Please try again.');
  });
});

describe('beaconConflictMessage', () => {
  it('maps beacon_in_use to the mobile copy', () => {
    const message = beaconConflictMessage(
      apiError(409, { error: 'beacon_in_use', message: 'server prose' }),
    );
    expect(message).toContain('already associated with a different item');
  });

  it('maps kit_has_tracker', () => {
    const message = beaconConflictMessage(
      apiError(409, { error: 'kit_has_tracker', message: 'server prose' }),
    );
    expect(message).toBe('This item already has a tracker attached.');
  });

  it('is null for anything that is not a conflict', () => {
    expect(beaconConflictMessage(apiError(400, { part: ['nope'] }))).toBeNull();
    expect(beaconConflictMessage(apiError(500, {}))).toBeNull();
  });
});

describe('locationOptions', () => {
  it('offers the four defaults when the org has no facets yet', () => {
    // A brand-new org's facets are empty, and a required select with no options
    // is a dead end on the very first kit anyone tries to receive.
    expect(locationOptions([])).toEqual(['Home', 'Storage Unit', 'Vehicle', 'Warehouse']);
  });

  it('merges facets with the defaults, de-duplicated and sorted', () => {
    expect(locationOptions(['Warehouse', 'Bay 4'])).toEqual([
      'Bay 4',
      'Home',
      'Storage Unit',
      'Vehicle',
      'Warehouse',
    ]);
  });

  it('tolerates the facets not having loaded', () => {
    expect(locationOptions(undefined)).toEqual(['Home', 'Storage Unit', 'Vehicle', 'Warehouse']);
  });
});
