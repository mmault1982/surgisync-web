import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { PartDetail } from '@/api/generated/model';

import {
  buildProductBody,
  buildProductPatch,
  formatPrice,
  hasProductErrors,
  initialProductValues,
  isUnchanged,
  productFieldErrors,
  seedProductValues,
  validateProduct,
  type ProductValues,
} from '../product';

function part(overrides: Partial<PartDetail> = {}): PartDetail {
  return {
    id: 7,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    // `name` mirrors `description` on the wire — it is the deprecated alias.
    name: 'Locking Screw 3.5mm',
    description: 'Locking Screw 3.5mm',
    kind: 'component',
    reference_number: 'LS-3500',
    is_serialized: false,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    udi: '00860000000017',
    list_price: '42.50',
    ...overrides,
  };
}

function values(overrides: Partial<ProductValues> = {}): ProductValues {
  return { ...seedProductValues(part()), ...overrides };
}

/**
 * A DRF 400, as `asFieldErrors` expects to find it.
 *
 * A real `AxiosError`, because `asFieldErrors` gates on
 * `axios.isAxiosError` — a plain object with the same shape reads as "not an
 * API error at all" and returns null. Same fixture as `surgeons.test.ts`.
 */
function fieldError(fields: Record<string, string[]>) {
  const error = new AxiosError('failed');
  error.response = {
    data: fields,
    status: 400,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('seedProductValues', () => {
  it('reads description, not the deprecated name alias', () => {
    // Seeding from `name` would write the alias back on the next save.
    expect(seedProductValues(part({ name: 'Stale Alias' })).description).toBe(
      'Locking Screw 3.5mm',
    );
  });

  it('turns the nullable fields into the empty strings an input holds', () => {
    const seeded = seedProductValues(part({ reference_number: null, udi: null, list_price: null }));

    expect(seeded.referenceNumber).toBe('');
    expect(seeded.udi).toBe('');
    expect(seeded.listPrice).toBe('');
  });

  it('carries the manufacturer as the string a Select uses', () => {
    expect(seedProductValues(part()).manufacturer).toBe('9');
  });
});

describe('initialProductValues', () => {
  it('starts on component, not kit', () => {
    // A kit is a bill of materials this form cannot author, so defaulting to
    // one would offer an empty kit as the easiest thing to create.
    expect(initialProductValues().kind).toBe('component');
  });
});

describe('validateProduct', () => {
  it('requires a manufacturer', () => {
    expect(validateProduct(values({ manufacturer: '' })).manufacturer).toBeDefined();
  });

  it('requires a description that is not only whitespace', () => {
    expect(validateProduct(values({ description: '   ' })).description).toBeDefined();
  });

  it('accepts a part with no reference number, UDI or price', () => {
    // Kits carry no catalog number at all, and a component may legitimately
    // have neither a UDI nor a price on file.
    const errors = validateProduct(
      values({ referenceNumber: '', udi: '', listPrice: '', kind: 'kit' }),
    );

    expect(hasProductErrors(errors)).toBe(false);
  });

  it('refuses a price that is not an amount', () => {
    expect(validateProduct(values({ listPrice: 'free' })).listPrice).toBeDefined();
    expect(validateProduct(values({ listPrice: '42.505' })).listPrice).toBeDefined();
  });

  it('accepts the amounts a price field is actually typed as', () => {
    for (const listPrice of ['0', '42', '42.5', '42.50', '1234.99']) {
      expect(validateProduct(values({ listPrice })).listPrice).toBeUndefined();
    }
  });

  it('refuses a negative price, which the contract pattern would allow', () => {
    // The `-?` in the schema is there because the column is a DecimalField,
    // not because a catalog part can cost less than nothing.
    expect(validateProduct(values({ listPrice: '-1.00' })).listPrice).toBeDefined();
  });

  it('leaves all three uniqueness rules to the server', () => {
    // Reference number is unique per manufacturer, UDI across the whole active
    // catalog including rows this org cannot see, and a kit's description per
    // manufacturer. None is answerable here.
    expect(hasProductErrors(validateProduct(values()))).toBe(false);
  });
});

describe('buildProductBody', () => {
  it('trims and converts to the wire types', () => {
    expect(
      buildProductBody(
        values({
          manufacturer: '9',
          description: '  Locking Screw 3.5mm  ',
          referenceNumber: '  LS-3500  ',
          udi: '  00860000000017  ',
          listPrice: ' 42.50 ',
        }),
      ),
    ).toEqual({
      manufacturer: 9,
      kind: 'component',
      is_serialized: false,
      description: 'Locking Screw 3.5mm',
      reference_number: 'LS-3500',
      udi: '00860000000017',
      list_price: '42.50',
    });
  });

  it('sends null rather than an empty string for an absent price', () => {
    // The column is a decimal: the server reads '' as a malformed number
    // rather than as "no price".
    expect(buildProductBody(values({ listPrice: '' })).list_price).toBeNull();
  });

  it('sends empty strings for an absent reference number and UDI', () => {
    // Both columns treat '' and NULL alike — each uniqueness constraint
    // exempts both — and a blank input means blank.
    const body = buildProductBody(values({ referenceNumber: '', udi: '' }));

    expect(body.reference_number).toBe('');
    expect(body.udi).toBe('');
  });
});

describe('buildProductPatch', () => {
  it('sends only what changed', () => {
    expect(buildProductPatch(values({ listPrice: '99.00' }), part())).toEqual({
      list_price: '99.00',
    });
  });

  it('never sends kind, which is read-only on update', () => {
    // It decides the row's identity space and is stamped once at creation, so
    // a client that always sent it would be sending a key the server drops.
    expect(buildProductPatch(values({ kind: 'kit' }), part())).toEqual({});
  });

  it('sends a cleared UDI as an empty string rather than omitting it', () => {
    // Omitting the key would leave the old value in place, which is the
    // opposite of what an emptied field means.
    expect(buildProductPatch(values({ udi: '' }), part())).toEqual({ udi: '' });
  });

  it('sends a cleared price as null', () => {
    expect(buildProductPatch(values({ listPrice: '' }), part())).toEqual({ list_price: null });
  });

  it('ignores whitespace-only edits', () => {
    expect(buildProductPatch(values({ description: '  Locking Screw 3.5mm  ' }), part())).toEqual(
      {},
    );
  });
});

describe('isUnchanged', () => {
  it('is true for an untouched form', () => {
    expect(isUnchanged(values(), part())).toBe(true);
  });

  it('is false once a field differs', () => {
    expect(isUnchanged(values({ isSerialized: true }), part())).toBe(false);
  });
});

describe('productFieldErrors', () => {
  it('maps each server field onto the slot that renders it', () => {
    expect(
      productFieldErrors(
        fieldError({
          reference_number: ['This manufacturer already has a part with this reference number.'],
          udi: ['Another active part already carries this UDI.'],
        }),
      ),
    ).toEqual({
      referenceNumber: 'This manufacturer already has a part with this reference number.',
      udi: 'Another active part already carries this UDI.',
    });
  });

  it('ignores keys no field owns, so the form-level fallback can show them', () => {
    expect(productFieldErrors(fieldError({ non_field_errors: ['Nope.'] }))).toEqual({});
  });

  it('is empty for an error that is not a 400', () => {
    expect(productFieldErrors(new Error('network'))).toEqual({});
  });
});

describe('formatPrice', () => {
  it('formats the digits the server sent', () => {
    expect(formatPrice('42.5')).toBe('$42.50');
    expect(formatPrice('1234.99')).toBe('$1,234.99');
  });

  it('renders an em dash where there is no price', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice('')).toBe('—');
  });

  it('shows an unparseable value rather than NaN', () => {
    expect(formatPrice('not a price')).toBe('not a price');
  });
});
