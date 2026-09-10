import { describe, expect, it } from 'vitest';

import type { ImportRow } from '@/api/generated/model';

import { DIRECTORY_REASONS, rowReason } from '../import-report';
import { MANUFACTURER_REASONS } from '../manufacturer-import';

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { row: 2, name: 'Acme Ortho', outcome: 'failed', ...overrides };
}

/**
 * The map exists to do two jobs, and these are those two jobs — not a
 * restatement of every entry, which would only assert that the file says what
 * it says.
 */
describe('the manufacturer reason map', () => {
  it.each(['already_exists', 'missing_column'])(
    'overrides %s, which the directory map now answers wrongly',
    (code) => {
      // `already_exists` narrowed when this importer started amending: it used
      // to mean "there is nothing here to amend" and now means "the file agrees
      // in every stated field". `missing_column` points at a template that is
      // no longer one column.
      expect(DIRECTORY_REASONS[code]).toBeDefined();
      expect(MANUFACTURER_REASONS[code]).not.toBe(DIRECTORY_REASONS[code]);
    },
  );

  it('leaves the shared map alone for procedures and surgeons', () => {
    // Those two are still lists of names, and the old wording is still exactly
    // right for them — which is why this is a second map rather than an edit.
    expect(DIRECTORY_REASONS.already_exists).toBe('Already in your list');
    expect(DIRECTORY_REASONS.missing_column).toContain('name');
  });

  it('leaves a specific server message alone', () => {
    // The server names the column that was too long and the fields that
    // changed; a short client phrase would be a worse sentence and a second
    // place to maintain it.
    const detail = 'City is 101 characters; use 100 or fewer.';

    expect(rowReason(row({ code: 'value_too_long', detail }), MANUFACTURER_REASONS)).toBe(detail);
  });

  it('leaves an update to say what it changed', () => {
    const detail = 'Updated Phone, Contact Email.';

    expect(
      rowReason(row({ outcome: 'updated', code: 'fields_updated', detail }), MANUFACTURER_REASONS),
    ).toBe(detail);
  });

  it('names the manufacturers template in the wrong-columns message', () => {
    expect(MANUFACTURER_REASONS.missing_column).toContain('manufacturers template');
  });

  it('still has a last resort', () => {
    expect(rowReason(row({ code: 'invented_code' }), MANUFACTURER_REASONS)).toBe(
      'Could not be imported',
    );
  });
});
