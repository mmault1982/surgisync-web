import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { Manufacturer } from '@/api/generated/model';

import {
  buildManufacturerBody,
  canManageManufacturers,
  deleteErrorMessage,
  hasManufacturerErrors,
  initialManufacturerValues,
  isUnchanged,
  manufacturerFieldErrors,
  manufacturerSaveErrorMessage,
  seedManufacturerValues,
  validateManufacturer,
  type ManufacturerValues,
} from '../manufacturers';

function manufacturer(overrides: Partial<Manufacturer> = {}): Manufacturer {
  return { id: 7, name: 'Acme Ortho', barcode: null, ...overrides };
}

function values(overrides: Partial<ManufacturerValues> = {}): ManufacturerValues {
  return { name: 'Acme Ortho', ...overrides };
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

describe('validateManufacturer', () => {
  it('accepts a name', () => {
    expect(validateManufacturer(values())).toEqual({});
  });

  it('requires one', () => {
    expect(validateManufacturer(values({ name: '' })).name).toBeTruthy();
  });

  it('treats whitespace as blank, because the server trims too', () => {
    expect(validateManufacturer(values({ name: '   ' })).name).toBeTruthy();
  });

  it('holds the contract line at 100 characters', () => {
    expect(validateManufacturer(values({ name: 'x'.repeat(100) })).name).toBeUndefined();
    expect(validateManufacturer(values({ name: 'x'.repeat(101) })).name).toBeTruthy();
  });
});

describe('hasManufacturerErrors', () => {
  it('is false for an empty map', () => {
    expect(hasManufacturerErrors({})).toBe(false);
  });

  it('is true once any slot is filled', () => {
    expect(hasManufacturerErrors({ name: 'Enter a name.' })).toBe(true);
  });
});

describe('buildManufacturerBody', () => {
  it('trims, so a padded name cannot pass here and collide on the server', () => {
    expect(buildManufacturerBody(values({ name: '  Acme Ortho  ' }))).toEqual({
      name: 'Acme Ortho',
    });
  });

  it('sends nothing but the name', () => {
    const body = buildManufacturerBody(values());

    // The omissions are the point: barcode is generated from the name,
    // ownership comes from the session, is_active is what DELETE writes.
    expect(Object.keys(body)).toEqual(['name']);
    expect(body).not.toHaveProperty('barcode');
    expect(body).not.toHaveProperty('parent_company');
    expect(body).not.toHaveProperty('is_active');
  });
});

describe('seeding', () => {
  it('starts empty for a new manufacturer', () => {
    expect(initialManufacturerValues()).toEqual({ name: '' });
  });

  it('starts from the row when renaming', () => {
    expect(seedManufacturerValues(manufacturer({ name: 'Beta Devices' }))).toEqual({
      name: 'Beta Devices',
    });
  });
});

describe('isUnchanged', () => {
  it('is true when only padding differs, so no request is sent', () => {
    expect(isUnchanged(values({ name: '  Acme Ortho ' }), manufacturer())).toBe(true);
  });

  it('is false for a real edit', () => {
    expect(isUnchanged(values({ name: 'Acme Orthopaedics' }), manufacturer())).toBe(false);
  });
});

describe('manufacturerFieldErrors', () => {
  it('slots the uniqueness clash under the input', () => {
    const error = apiError(400, {
      name: ['Your organization already has a manufacturer with this name.'],
    });

    expect(manufacturerFieldErrors(error)).toEqual({
      name: 'Your organization already has a manufacturer with this name.',
    });
  });

  it('ignores anything that is not a 400 field map', () => {
    expect(manufacturerFieldErrors(apiError(500, 'nope'))).toEqual({});
    expect(manufacturerFieldErrors(null)).toEqual({});
  });
});

describe('manufacturerSaveErrorMessage', () => {
  it('surfaces a field the form has no slot for, rather than dropping it', () => {
    const error = apiError(400, { non_field_errors: ['You must belong to an organization.'] });

    expect(manufacturerSaveErrorMessage(error)).toBe('You must belong to an organization.');
  });

  it('falls back to the house message when nothing is slottable', () => {
    expect(manufacturerSaveErrorMessage(apiError(500, {}))).toBeTruthy();
  });
});

describe('deleteErrorMessage', () => {
  it('reads the 409 the database cannot raise', () => {
    // Part.manufacturer is PROTECT, but a soft delete never trips a foreign
    // key — so the server checks, and its message carries the count.
    const error = apiError(409, {
      error: 'manufacturer_in_use',
      message: 'Acme Ortho still has 12 catalog parts and cannot be removed.',
    });

    expect(deleteErrorMessage(error)).toBe(
      'Acme Ortho still has 12 catalog parts and cannot be removed.',
    );
  });

  it('branches on the code, not the prose', () => {
    const error = apiError(409, { error: 'something_else', message: 'Other conflict.' });

    // Not the conflict we know about, so it goes through the house mapping
    // rather than being rendered as if it were.
    expect(deleteErrorMessage(error)).toBeTruthy();
  });
});

describe('canManageManufacturers', () => {
  it('accepts the two roles the backend accepts', () => {
    // Mirrors ADMIN_ROLES in users/permissions.py.
    expect(canManageManufacturers('admin')).toBe(true);
    expect(canManageManufacturers('entity_global_admin')).toBe(true);
  });

  it('refuses a rep, who would otherwise fill the form and be told 403', () => {
    expect(canManageManufacturers('non_admin')).toBe(false);
  });

  it('refuses an absent role rather than assuming one', () => {
    expect(canManageManufacturers(null)).toBe(false);
    expect(canManageManufacturers(undefined)).toBe(false);
  });
});
