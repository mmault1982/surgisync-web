import { describe, expect, it } from 'vitest';

import { MAX_NAME_LENGTH, isUnchanged, validateName } from '../name';

describe('validateName', () => {
  it('accepts a name', () => {
    expect(validateName('Total Knee Arthroplasty')).toBeUndefined();
  });

  it('requires one', () => {
    expect(validateName('')).toBeTruthy();
  });

  it('treats whitespace as blank, because the server trims too', () => {
    expect(validateName('   ')).toBeTruthy();
  });

  it('holds the contract line at 100 characters', () => {
    expect(validateName('x'.repeat(MAX_NAME_LENGTH))).toBeUndefined();
    expect(validateName('x'.repeat(MAX_NAME_LENGTH + 1))).toBeTruthy();
  });

  it('says nothing about uniqueness', () => {
    // Only the server can know: the rule is case-insensitive and scoped to the
    // caller's organization. Its 400 lands in the same slot.
    expect(validateName('A name that may well already exist')).toBeUndefined();
  });
});

describe('isUnchanged', () => {
  it('is true when only padding differs, so no request is sent', () => {
    expect(isUnchanged('  Total Knee ', 'Total Knee')).toBe(true);
  });

  it('is false for a real edit', () => {
    expect(isUnchanged('Total Knee Revision', 'Total Knee')).toBe(false);
  });
});
