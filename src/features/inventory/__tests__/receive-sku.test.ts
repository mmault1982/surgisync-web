import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { PartList } from '@/api/generated/model';

import type { StagedPhoto } from '../receive-kit';
import {
  buildSkuCreateBody,
  hasSkuErrors,
  initialSkuValues,
  isQuantityLocked,
  parseQuantity,
  resetSkuItem,
  resolveCatalogNumber,
  skuFieldErrors,
  skuSaveErrorMessage,
  validateReceiveSku,
  type ReceiveSkuValues,
} from '../receive-sku';

/**
 * The SKU form's rules, driven directly.
 *
 * Two of these are the reason this module exists rather than being folded into
 * the component: the manufacturer-mismatch decision, which is the difference
 * between filing stock correctly and filing it under a manufacturer nobody
 * picked, and the serialized-quantity pin, which the server enforces and the
 * form must not contradict.
 */

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 314,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    // Shaped like real catalog data: components carry a description and no
    // name, kits the other way round. A fixture with a name here would have
    // hidden a permanently blank Description field.
    name: null,
    description: 'REAMER CANNULATED ACORN 4.5MM',
    kind: 'component',
    reference_number: 'CS-3510',
    is_serialized: false,
    manufacturer: 5,
    manufacturer_name: 'Acme Ortho',
    ...overrides,
  };
}

function photo(key: string): StagedPhoto {
  return {
    key,
    file: new File(['x'], `${key}.png`, { type: 'image/png' }),
    previewUrl: `blob:${key}`,
  };
}

function filled(overrides: Partial<ReceiveSkuValues> = {}): ReceiveSkuValues {
  return {
    ...initialSkuValues(),
    manufacturerId: 5,
    representativeId: 12,
    physicalLocation: 'Warehouse',
    catalogNumber: 'CS-3510',
    ...overrides,
  };
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

describe('resolveCatalogNumber', () => {
  it('reports a number no catalog item carries', () => {
    const { part: resolved, error } = resolveCatalogNumber([], 5);
    expect(resolved).toBeNull();
    expect(error).toBe('No catalog item has that number');
  });

  it('picks the part belonging to the chosen manufacturer', () => {
    // The number is unique per manufacturer, not across the catalog, so more
    // than one row is a legitimate answer rather than a server bug.
    const results = [part({ id: 1, manufacturer: 9 }), part({ id: 2, manufacturer: 5 })];
    const { part: resolved, error } = resolveCatalogNumber(results, 5);
    expect(resolved?.id).toBe(2);
    expect(error).toBeNull();
  });

  it('blocks when the number belongs to a different manufacturer, and names it', () => {
    // Blocking rather than a warning: the server derives the stock item's
    // manufacturer from its part, so a mismatch would file the stock under one
    // nobody picked and nothing would reject it.
    const { part: resolved, error } = resolveCatalogNumber(
      [part({ manufacturer: 9, manufacturer_name: 'Beta Devices' })],
      5,
    );
    expect(resolved).toBeNull();
    expect(error).toBe('This item belongs to Beta Devices');
  });

  it('falls back to a generic mismatch when the manufacturer has no name', () => {
    const { error } = resolveCatalogNumber([part({ manufacturer: 9, manufacturer_name: '' })], 5);
    expect(error).toBe('This item belongs to a different manufacturer');
  });

  it('holds the item when no manufacturer has been chosen yet', () => {
    // Accusing the user of a mismatch they have not had the chance to make
    // would be wrong; submit re-checks once a manufacturer exists.
    const { part: resolved, error } = resolveCatalogNumber([part()], null);
    expect(resolved?.id).toBe(314);
    expect(error).toBeNull();
  });
});

describe('quantity', () => {
  it('is locked for a serialized part', () => {
    expect(isQuantityLocked(part({ is_serialized: true }))).toBe(true);
    expect(isQuantityLocked(part({ is_serialized: false }))).toBe(false);
    expect(isQuantityLocked(null)).toBe(false);
  });

  it('is 1 for a serialized part whatever the field says', () => {
    // The server rejects any other value for one, so the form must not offer
    // to send it.
    expect(parseQuantity(filled({ quantity: '7' }), part({ is_serialized: true }))).toBe(1);
  });

  it('parses a bulk quantity', () => {
    expect(parseQuantity(filled({ quantity: '12' }), part())).toBe(12);
  });

  it('rejects zero, negatives, blanks and non-numbers', () => {
    for (const raw of ['0', '-1', '', '  ', 'abc', '1.5', '1e3']) {
      expect(parseQuantity(filled({ quantity: raw }), part())).toBeNull();
    }
  });
});

describe('validateReceiveSku', () => {
  it('accepts a resolved, complete form', () => {
    expect(hasSkuErrors(validateReceiveSku(filled(), part(), [], null))).toBe(false);
  });

  it('requires the session selections and a catalog number', () => {
    const errors = validateReceiveSku(initialSkuValues(), null, [], null);
    expect(errors.manufacturer).toBeTruthy();
    expect(errors.representative).toBeTruthy();
    expect(errors.location).toBeTruthy();
    expect(errors.catalogNumber).toBeTruthy();
  });

  it('blocks on an unresolved catalog number', () => {
    const errors = validateReceiveSku(filled(), null, [], null);
    expect(errors.catalogNumber).toBe('Look up the catalog number first');
  });

  it('surfaces the lookup error on the catalog field', () => {
    const errors = validateReceiveSku(filled(), null, [], 'This item belongs to Beta Devices');
    expect(errors.catalogNumber).toBe('This item belongs to Beta Devices');
  });

  it('does not require a photo, unlike a kit', () => {
    // Mobile requires one for a kit and none for a SKU: a loose component
    // often has nothing worth photographing.
    expect(validateReceiveSku(filled(), part(), [], null).photos).toBeUndefined();
  });

  it('still caps photos at ten', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => photo(`p${i}`));
    expect(validateReceiveSku(filled(), part(), eleven, null).photos).toBeTruthy();
  });
});

describe('buildSkuCreateBody', () => {
  it('sends the resolved part and the quantity', () => {
    const body = buildSkuCreateBody(filled({ quantity: '4' }), part());
    expect(body.part).toBe(314);
    expect(body.quantity).toBe(4);
  });

  it('pins the quantity to 1 for a serialized part', () => {
    const body = buildSkuCreateBody(filled({ quantity: '9' }), part({ is_serialized: true }));
    expect(body.quantity).toBe(1);
  });

  it('omits is_complete', () => {
    // A kit's "are all its components present" question means nothing for a
    // loose part, and sending it would write a history line about a property
    // this row does not have.
    expect(buildSkuCreateBody(filled(), part())).not.toHaveProperty('is_complete');
  });

  it('omits photo, quantity-free extras and is_draft', () => {
    const body = buildSkuCreateBody(filled(), part());
    expect(body).not.toHaveProperty('photo');
    expect(body).not.toHaveProperty('is_draft');
  });

  it('omits the optional fields when blank and trims them when not', () => {
    const blank = buildSkuCreateBody(filled({ udi: ' ', lotCode: '', notes: '  ' }), part());
    expect(blank).not.toHaveProperty('udi');
    expect(blank).not.toHaveProperty('lot_code');
    expect(blank).not.toHaveProperty('notes');
    expect(blank).not.toHaveProperty('expiration_date');

    const set = buildSkuCreateBody(
      filled({
        udi: ' (01)123 ',
        lotCode: ' LOT-1 ',
        notes: ' fine ',
        expirationDate: '2027-03-01',
      }),
      part(),
    );
    expect(set.udi).toBe('(01)123');
    expect(set.lot_code).toBe('LOT-1');
    expect(set.notes).toBe('fine');
    expect(set.expiration_date).toBe('2027-03-01');
  });
});

describe('resetSkuItem', () => {
  it('clears the item and keeps the session', () => {
    // SKU mode loads a delivery one line at a time; re-picking all four
    // session fields per item is the friction mobile deliberately avoids.
    const next = resetSkuItem(
      filled({ quantity: '5', udi: 'x', lotCode: 'y', notes: 'z', expirationDate: '2027-03-01' }),
    );

    expect(next.manufacturerId).toBe(5);
    expect(next.representativeId).toBe(12);
    expect(next.physicalLocation).toBe('Warehouse');
    expect(next.ownershipType).toBe('consigned');

    expect(next.catalogNumber).toBe('');
    expect(next.quantity).toBe('1');
    expect(next.udi).toBe('');
    expect(next.lotCode).toBe('');
    expect(next.notes).toBe('');
    expect(next.expirationDate).toBe('');
  });
});

describe('skuFieldErrors', () => {
  it('routes rejected fields to their slots', () => {
    const errors = skuFieldErrors(
      apiError(400, { quantity: ['Must be 1.'], udi: ['Already used.'] }),
    );
    expect(errors.quantity).toBe('Must be 1.');
    expect(errors.udi).toBe('Already used.');
  });

  it('routes part to the catalog field, which is what the user can change', () => {
    expect(skuFieldErrors(apiError(400, { part: ['Invalid pk.'] })).catalogNumber).toBe(
      'Invalid pk.',
    );
  });
});

describe('skuSaveErrorMessage', () => {
  it('surfaces a rejected field with no slot on this form', () => {
    expect(skuSaveErrorMessage(apiError(400, { parent_company: ['No org.'] }))).toBe('No org.');
  });

  it('falls back to the house copy', () => {
    expect(skuSaveErrorMessage(apiError(500, {}))).toBe('Something went wrong. Please try again.');
  });
});
