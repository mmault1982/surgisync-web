import { describe, expect, it } from 'vitest';

import type { PartList } from '@/api/generated/model';

import { resolveCatalogNumber } from '../part-lookup';

/**
 * Resolving a typed catalog number to one part.
 *
 * These moved here with `part-lookup.ts` when the Bill of Materials panel's
 * Add dialog became its second caller. The manufacturer-mismatch decision is
 * the reason the module is worth testing directly: it is the difference
 * between filing a row against the part the user meant and one nobody picked.
 */

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 314,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    // `name` mirrors `description` — it is a deprecated read-only alias of it
    // since the label fold, kept on the wire for shipped Flutter builds. The
    // two split the job by kind before that, and a fixture carrying only a
    // name would have hidden a permanently blank Description field.
    name: 'REAMER CANNULATED ACORN 4.5MM',
    description: 'REAMER CANNULATED ACORN 4.5MM',
    kind: 'component',
    reference_number: 'CS-3510',
    is_serialized: false,
    manufacturer: 5,
    manufacturer_name: 'Acme Ortho',
    ...overrides,
  };
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
