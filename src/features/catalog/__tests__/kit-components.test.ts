import { describe, expect, it } from 'vitest';

import type { PartComponent } from '@/api/generated/model';

import {
  componentLabel,
  isUnchangedQuantity,
  MAX_COMPONENT_QUANTITY,
  parseQuantity,
  validateQuantity,
} from '../kit-components';

/**
 * The Bill of Materials panel's rules, driven directly.
 *
 * The quantity field is a string, so the interesting cases are the values that
 * look numeric to a loose parser and are not what the user typed — `'1e3'`,
 * `'3kg'`, `'1.5'`. Each of those round-trips to something nobody meant.
 */

function row(overrides: Partial<PartComponent> = {}): PartComponent {
  return {
    id: 41,
    item: 7,
    item_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description: 'Locking Screw 3.5mm',
    reference_number: 'LS-3500',
    quantity: 4,
    ...overrides,
  };
}

describe('validateQuantity', () => {
  it('accepts a whole number', () => {
    expect(validateQuantity('1')).toBeUndefined();
    expect(validateQuantity('12')).toBeUndefined();
  });

  it('trims, because a paste often carries whitespace', () => {
    expect(validateQuantity('  3  ')).toBeUndefined();
  });

  it('asks for a value when the box is empty', () => {
    expect(validateQuantity('')).toBe('Enter a quantity.');
    expect(validateQuantity('   ')).toBe('Enter a quantity.');
  });

  it.each(['abc', '3kg', '1.5', '1e3', '-1', '+2'])('refuses %s', (value) => {
    expect(validateQuantity(value)).toBe('Use whole numbers only.');
  });

  it('refuses zero as a quantity rather than a format', () => {
    // A row for none of a part is the row's absence, spelled at greater
    // length — and the server refuses it too.
    expect(validateQuantity('0')).toBe('Enter a quantity of 1 or more.');
  });

  it('accepts the cap and refuses one above it', () => {
    expect(validateQuantity(String(MAX_COMPONENT_QUANTITY))).toBeUndefined();
    expect(validateQuantity(String(MAX_COMPONENT_QUANTITY + 1))).toBe('Enter 100,000 or fewer.');
  });
});

describe('parseQuantity', () => {
  it('answers the number when the field holds one', () => {
    expect(parseQuantity(' 7 ')).toBe(7);
  });

  it('answers null when it does not', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('1e3')).toBeNull();
  });
});

describe('isUnchangedQuantity', () => {
  it('is true for the same number, however it is spelled', () => {
    expect(isUnchangedQuantity('3', 3)).toBe(true);
    expect(isUnchangedQuantity(' 3 ', 3)).toBe(true);
  });

  it('is false for a different one', () => {
    expect(isUnchangedQuantity('4', 3)).toBe(false);
  });

  it('is false for a value that is not a quantity at all', () => {
    // Otherwise an emptied box would read as "unchanged" and close the dialog
    // silently instead of showing the error.
    expect(isUnchangedQuantity('', 3)).toBe(false);
  });
});

describe('componentLabel', () => {
  it('is the description', () => {
    expect(componentLabel(row())).toBe('Locking Screw 3.5mm');
  });

  it('falls back to the catalog number for a kit nested in a kit', () => {
    // Structurally legal — both ends of the junction are parts — and the one
    // row that can arrive without a description.
    expect(componentLabel(row({ description: '  ' }))).toBe('LS-3500');
  });

  it('has a last resort when there is neither', () => {
    expect(componentLabel(row({ description: '', reference_number: null }))).toBe(
      'Unnamed component',
    );
  });
});
