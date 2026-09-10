import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  hasManufacturerErrors,
  initialManufacturerValues,
  isUnchanged,
  manufacturerFieldErrors,
  manufacturerSaveErrorMessage,
  manufacturerSavePlan,
  seedManufacturerValues,
  validateManufacturer,
} from '../manufacturer-form';

import { companyFixture, manufacturerDetailFixture } from './manufacturer-fixture';

/** A 400 as axios delivers it, so `asFieldErrors` sees what it would in life. */
function fieldError(body: Record<string, string[]>) {
  return new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, null, {
    status: 400,
    statusText: 'Bad Request',
    data: body,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

const RECORD = manufacturerDetailFixture({
  company: companyFixture({ phone: '555-0100', contact_email: 'old@b.co' }),
});

describe('seeding', () => {
  it('reads the name off the role and the ten contact fields off the company', () => {
    expect(seedManufacturerValues(RECORD)).toMatchObject({
      name: 'Acme Ortho',
      phone: '555-0100',
      contact_email: 'old@b.co',
      billing_contact_name: '',
    });
  });

  it('renders an absent contact field as an empty string', () => {
    // Every value is a string because that is what an `<input>` holds.
    const seeded = seedManufacturerValues(
      manufacturerDetailFixture({ company: { id: 3, addresses: [] } }),
    );
    expect(seeded.fax).toBe('');
  });
});

describe('validation', () => {
  it('requires a name', () => {
    expect(validateManufacturer({ ...initialManufacturerValues(), name: '  ' }).name).toBe(
      'Enter a name.',
    );
  });

  it('caps the name at the column width', () => {
    const errors = validateManufacturer({
      ...initialManufacturerValues(),
      name: 'x'.repeat(101),
    });
    expect(errors.name).toBe('Use 100 characters or fewer.');
  });

  it('checks the shape of a filled-in email and ignores a blank one', () => {
    const errors = validateManufacturer({
      ...initialManufacturerValues(),
      name: 'Acme',
      contact_email: 'nope',
    });
    expect(errors.contact_email).toBe('Enter a valid email address.');
    // Optional, as the model has it — every contact field is blankable.
    expect(errors.billing_contact_email).toBeUndefined();
    expect(hasManufacturerErrors(errors)).toBe(true);
  });

  it('does not invent a uniqueness rule', () => {
    // Only the server can answer it: the name is unique per organization,
    // case-insensitively, against rows this client cannot see.
    const errors = validateManufacturer({ ...initialManufacturerValues(), name: 'Acme Ortho' });
    expect(hasManufacturerErrors(errors)).toBe(false);
  });
});

describe('the save plan', () => {
  it('always writes the name when there is no record yet', () => {
    const plan = manufacturerSavePlan({ ...initialManufacturerValues(), name: '  Beta  ' }, null);
    expect(plan.renameTo).toBe('Beta');
    expect(plan.companyPatch).toBeUndefined();
  });

  it('omits the rename when the name is unchanged', () => {
    expect(manufacturerSavePlan(seedManufacturerValues(RECORD), RECORD).renameTo).toBeUndefined();
  });

  it('carries only the contact keys that changed', () => {
    const plan = manufacturerSavePlan(
      { ...seedManufacturerValues(RECORD), contact_email: 'new@b.co' },
      RECORD,
    );
    expect(plan.companyPatch).toEqual({ contact_email: 'new@b.co' });
  });

  it('treats an absent key on the record as a blank rather than a change', () => {
    // A client holding an older document should not read a missing key as an
    // edit; the server renders every blankable CharField as `''` anyway.
    const sparse = manufacturerDetailFixture({ company: { id: 3, addresses: [] } });
    expect(
      manufacturerSavePlan(seedManufacturerValues(sparse), sparse).companyPatch,
    ).toBeUndefined();
  });

  it('reports no work when nothing changed', () => {
    expect(isUnchanged(seedManufacturerValues(RECORD), RECORD)).toBe(true);
  });
});

describe('server errors', () => {
  it('routes name and contact clashes to their own slots', () => {
    const errors = manufacturerFieldErrors(
      fieldError({
        name: ['Already taken.'],
        billing_contact_email: ['Enter a valid email address.'],
      }),
    );
    expect(errors).toEqual({
      name: 'Already taken.',
      billing_contact_email: 'Enter a valid email address.',
    });
  });

  it('leaves a key with no control for the form-level alert', () => {
    // `addresses` is refused outright by the company PATCH, and there is no
    // input here for it — dropping it would leave the failure unexplained.
    const error = fieldError({ addresses: ['Addresses are not editable here.'] });
    expect(manufacturerFieldErrors(error)).toEqual({});
    expect(manufacturerSaveErrorMessage(error)).toBe('Addresses are not editable here.');
  });

  it('does not repeat in the alert what a field already shows', () => {
    const error = fieldError({ name: ['Already taken.'] });
    expect(manufacturerSaveErrorMessage(error)).not.toBe('Already taken.');
  });
});
