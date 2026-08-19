import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { SurgeonCatalog } from '@/api/generated/model';

import {
  MAX_NAME_LENGTH,
  buildSurgeonBody,
  hasSurgeonErrors,
  initialSurgeonValues,
  isUnchanged,
  seedSurgeonValues,
  surgeonFieldErrors,
  validateSurgeon,
  type SurgeonValues,
} from '../surgeons';

function surgeon(overrides: Partial<SurgeonCatalog> = {}): SurgeonCatalog {
  return { id: 7, name: 'Dr Jane Okafor', npi_number: '1234567890', is_owned: true, ...overrides };
}

function values(overrides: Partial<SurgeonValues> = {}): SurgeonValues {
  return { name: 'Dr Jane Okafor', npiNumber: '1234567890', ...overrides };
}

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

describe('validateSurgeon', () => {
  it('accepts a name and a 10-digit NPI', () => {
    expect(validateSurgeon(values())).toEqual({});
  });

  it('requires a name', () => {
    expect(validateSurgeon(values({ name: '   ' })).name).toBeTruthy();
  });

  it('holds the contract line at 100 characters', () => {
    expect(validateSurgeon(values({ name: 'x'.repeat(MAX_NAME_LENGTH) })).name).toBeUndefined();
    expect(validateSurgeon(values({ name: 'x'.repeat(101) })).name).toBeTruthy();
  });

  it('treats a blank NPI as fine, because the field is optional', () => {
    // A surgeon can be recorded before anyone has looked their number up.
    expect(validateSurgeon(values({ npiNumber: '' })).npiNumber).toBeUndefined();
  });

  it('rejects an NPI that is present but not 10 digits', () => {
    expect(validateSurgeon(values({ npiNumber: '12345' })).npiNumber).toBeTruthy();
    expect(validateSurgeon(values({ npiNumber: '12345678901' })).npiNumber).toBeTruthy();
    expect(validateSurgeon(values({ npiNumber: 'abcdefghij' })).npiNumber).toBeTruthy();
  });

  it('says nothing about uniqueness', () => {
    // Decided on the NPI first and the name only as a fallback, across both
    // lists the caller can see — so only the server can answer it.
    expect(validateSurgeon(values({ name: 'A name that may already exist' })).name).toBeUndefined();
  });
});

describe('hasSurgeonErrors', () => {
  it('is false for an empty map', () => {
    expect(hasSurgeonErrors({})).toBe(false);
  });

  it('is true once either slot is filled', () => {
    expect(hasSurgeonErrors({ npiNumber: 'An NPI is exactly 10 digits.' })).toBe(true);
  });
});

describe('buildSurgeonBody', () => {
  it('trims both fields', () => {
    expect(buildSurgeonBody(values({ name: '  Dr Okafor ', npiNumber: ' 1234567890 ' }))).toEqual({
      name: 'Dr Okafor',
      npi_number: '1234567890',
    });
  });

  it('sends a blank NPI rather than omitting it', () => {
    // On a PATCH the blank is what clears a number entered by mistake.
    // Omitting the key would leave the old value in place, which is the
    // opposite of what an emptied field means.
    expect(buildSurgeonBody(values({ npiNumber: '' }))).toEqual({
      name: 'Dr Jane Okafor',
      npi_number: '',
    });
  });

  it('sends nothing but those two', () => {
    expect(Object.keys(buildSurgeonBody(values()))).toEqual(['name', 'npi_number']);
  });
});

describe('seeding', () => {
  it('starts empty for a new surgeon', () => {
    expect(initialSurgeonValues()).toEqual({ name: '', npiNumber: '' });
  });

  it('starts from the row when amending', () => {
    expect(seedSurgeonValues(surgeon())).toEqual({
      name: 'Dr Jane Okafor',
      npiNumber: '1234567890',
    });
  });

  it('copes with a row that has no NPI', () => {
    expect(seedSurgeonValues(surgeon({ npi_number: undefined })).npiNumber).toBe('');
  });
});

describe('isUnchanged', () => {
  it('is true when only padding differs', () => {
    expect(isUnchanged(values({ name: ' Dr Jane Okafor ' }), surgeon())).toBe(true);
  });

  it('notices an NPI edit even when the name is untouched', () => {
    expect(isUnchanged(values({ npiNumber: '9999999999' }), surgeon())).toBe(false);
  });

  it('notices an NPI being cleared', () => {
    expect(isUnchanged(values({ npiNumber: '' }), surgeon())).toBe(false);
  });
});

describe('surgeonFieldErrors', () => {
  it('puts a duplicate NPI on the NPI field', () => {
    // Which slot the clash lands on is the server's judgement: a duplicate NPI
    // and a duplicate name are different findings, acted on differently.
    const error = apiError(400, {
      npi_number: ['A surgeon with this NPI is already available to your organization.'],
    });

    expect(surgeonFieldErrors(error)).toEqual({
      npiNumber: 'A surgeon with this NPI is already available to your organization.',
    });
  });

  it('puts a duplicate name on the name field', () => {
    const error = apiError(400, {
      name: ['A surgeon with this name is already available to your organization.'],
    });

    expect(surgeonFieldErrors(error).name).toBeTruthy();
  });

  it('ignores anything that is not a 400 field map', () => {
    expect(surgeonFieldErrors(apiError(500, 'nope'))).toEqual({});
  });
});
