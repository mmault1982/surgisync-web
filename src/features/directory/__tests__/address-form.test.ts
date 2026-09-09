import { describe, expect, it } from 'vitest';

import {
  ADDRESS_KIND_LABELS,
  addressLabel,
  buildAddressBody,
  buildAddressPatch,
  hasAddressErrors,
  initialAddressValues,
  isUnchanged,
  seedAddressValues,
  validateAddress,
} from '../address-form';

import { addressFixture } from './manufacturer-fixture';

const ROW = addressFixture();

describe('defaults', () => {
  it('opens on the kind and country the model itself defaults to', () => {
    // So the form and an omitted field cannot disagree about what was meant.
    const values = initialAddressValues();
    expect(values.kind).toBe('physical');
    expect(values.country).toBe('US');
    expect(values.is_primary).toBe(false);
  });

  it('names the kinds the way the model does', () => {
    // "Shipping / Receiving", not "Shipping" — a client that title-cased the
    // enum would be showing a different vocabulary from the admin.
    expect(ADDRESS_KIND_LABELS.shipping).toBe('Shipping / Receiving');
  });
});

describe('validation', () => {
  it('requires a street and a city when adding', () => {
    const errors = validateAddress(initialAddressValues(), { isNew: true });
    expect(errors.address_line_1).toBe('Enter a street address.');
    expect(errors.city).toBe('Enter a city.');
  });

  it('requires neither when amending', () => {
    // Every column is blankable server-side and migration 0131 backfilled
    // partial rows, so refusing to save one that arrived without a street would
    // leave it unpatchable — the exact thing the backend avoided.
    const partial = seedAddressValues(addressFixture({ address_line_1: '', city: '' }));
    expect(hasAddressErrors(validateAddress(partial, { isNew: false }))).toBe(false);
  });

  it('caps each field at its column width', () => {
    const values = { ...initialAddressValues(), state: 'x'.repeat(51) };
    expect(validateAddress(values, { isNew: false }).state).toBe('Use 50 characters or fewer.');
  });
});

describe('the create body', () => {
  it('sends every field, blank included', () => {
    // One shape rather than one per combination of filled-in controls.
    const body = buildAddressBody({ ...initialAddressValues(), city: ' Bloomington ' });
    expect(body.city).toBe('Bloomington');
    expect(body.label).toBe('');
    expect(body.kind).toBe('physical');
  });

  it('normalises the country and falls back to the model default', () => {
    expect(buildAddressBody({ ...initialAddressValues(), country: 'ca' }).country).toBe('CA');
    // `country` is the one field without `blank=True`, so `''` is a 400 rather
    // than a clear — which is why it carries `minLength: 1` in the contract.
    expect(buildAddressBody({ ...initialAddressValues(), country: '  ' }).country).toBe('US');
  });
});

describe('the update body', () => {
  it('carries only what changed', () => {
    const patch = buildAddressPatch({ ...seedAddressValues(ROW), city: 'Indianapolis' }, ROW);
    expect(patch).toEqual({ city: 'Indianapolis' });
  });

  it('treats an emptied country as unchanged rather than as a clear', () => {
    // The server would answer 400, not blank it, so "leave it alone" is the
    // only honest reading of an emptied box.
    expect(buildAddressPatch({ ...seedAddressValues(ROW), country: '' }, ROW)).toEqual({});
  });

  it('does not read a case difference in the country as an edit', () => {
    expect(buildAddressPatch({ ...seedAddressValues(ROW), country: 'us' }, ROW)).toEqual({});
  });

  it('sends is_primary only when it moves', () => {
    // Promotion is a transition, not a flag: re-sending an unchanged `true`
    // would ask the server to stand a sibling down for no reason.
    expect(buildAddressPatch(seedAddressValues(ROW), ROW).is_primary).toBeUndefined();
    expect(buildAddressPatch({ ...seedAddressValues(ROW), is_primary: true }, ROW).is_primary).toBe(
      true,
    );
  });

  it('reports no work when nothing changed', () => {
    expect(isUnchanged(seedAddressValues(ROW), ROW)).toBe(true);
  });
});

describe('labelling a row', () => {
  it('falls back through label, street and city', () => {
    expect(addressLabel(addressFixture({ label: 'Loading Dock B' }))).toBe('Loading Dock B');
    expect(addressLabel(ROW)).toBe('1 Mill Road');
    expect(addressLabel(addressFixture({ address_line_1: '' }))).toBe('Bloomington');
    // A row backfilled with nothing identifying still needs a name.
    expect(addressLabel(addressFixture({ address_line_1: '', city: '', kind: 'billing' }))).toBe(
      'Billing address',
    );
  });
});
