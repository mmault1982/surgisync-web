import { describe, expect, it } from 'vitest';

import type { ImportRow } from '@/api/generated/model';
import { DIRECTORY_REASONS, rowReason } from '@/features/directory/import-report';

import { BOM_REASONS, PARTS_REASONS } from '../catalog-import';

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { row: 2, name: 'TKS-FEM-01', outcome: 'failed', ...overrides };
}

/**
 * These maps exist to do two jobs, and the tests are those two jobs — not a
 * restatement of every entry, which would only assert that the file says what
 * it says.
 */
describe('the catalog reason maps', () => {
  it.each([
    ['already_exists', PARTS_REASONS],
    ['missing_column', PARTS_REASONS],
    ['already_exists', BOM_REASONS],
    ['missing_column', BOM_REASONS],
  ])('overrides %s, which the directory map would answer wrongly', (code, reasons) => {
    // Both codes are reported by all four importers and mean something
    // different in each. Left to the default, a catalog row would read "Already
    // in your list" or point at a `name` column neither catalog file has.
    expect(DIRECTORY_REASONS[code]).toBeDefined();
    expect(reasons[code]).toBeDefined();
    expect(reasons[code]).not.toBe(DIRECTORY_REASONS[code]);
  });

  it('leaves a specific server message alone', () => {
    // The server names the manufacturer it could not find; a short client
    // phrase would be a worse sentence and a second place to maintain it.
    const detail = "'Acme Ortho' is not one of your manufacturers.";

    expect(rowReason(row({ code: 'manufacturer_not_found', detail }), PARTS_REASONS)).toBe(detail);
    expect(rowReason(row({ code: 'kit_not_found', detail }), BOM_REASONS)).toBe(detail);
  });

  it('still has a last resort', () => {
    expect(rowReason(row({ code: 'invented_code' }), PARTS_REASONS)).toBe('Could not be imported');
  });

  it('tells the two files apart in the wrong-columns message', () => {
    // The whole point of two buttons is that the user knows which file they
    // are sending, so the error has to name the right template.
    expect(PARTS_REASONS.missing_column).toMatch(/parts template/);
    expect(BOM_REASONS.missing_column).toMatch(/bill-of-materials template/);
  });
});
