import { describe, expect, it } from 'vitest';

import type { PartList } from '@/api/generated/model';

import {
  CATALOG_DEFAULTS,
  activeFilterKeys,
  catalogLabel,
  catalogSearchSchema,
  hasActiveFilters,
} from '../catalog.search';

const parse = (input: unknown) => catalogSearchSchema.parse(input);

/** A PartList row with only the fields under test spelled out. */
function part(overrides: Partial<PartList>): PartList {
  return {
    id: 1,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    // `name` is a deprecated read-only alias of `description` since the label
    // fold; the rows here set `description`, which is what the code reads.
    name: '',
    description: '',
    kind: 'kit',
    reference_number: null,
    is_serialized: true,
    manufacturer: 1,
    manufacturer_name: 'Acme Ortho',
    ...overrides,
  };
}

describe('catalogSearchSchema', () => {
  it('applies defaults for an empty URL', () => {
    expect(parse({})).toEqual(CATALOG_DEFAULTS);
  });

  it('degrades a hand-edited URL to defaults instead of throwing', () => {
    const search = parse({
      page: 'banana',
      page_size: 9999,
      ordering: 'not_a_column',
      kind: 'implant',
    });

    expect(search.page).toBe(1);
    expect(search.page_size).toBe(CATALOG_DEFAULTS.page_size);
    expect(search.ordering).toBe(CATALOG_DEFAULTS.ordering);
    // Not a valid kind, so no filter at all — rather than a route error at
    // someone who mistyped, or a filter that matches nothing.
    expect(search.kind).toBeUndefined();
  });

  it('accepts the descending form of a sort', () => {
    expect(parse({ ordering: '-manufacturer_name' }).ordering).toBe('-manufacturer_name');
  });

  it('keeps the manufacturer filter as an array', () => {
    expect(parse({ manufacturer_id: [5, 9] }).manufacturer_id).toEqual([5, 9]);
  });

  it('accepts a single manufacturer where a list is expected', () => {
    // A hand-typed `?manufacturer_id=5` arrives as a scalar, while the router's
    // own navigation emits `?manufacturer_id=[5]`. Accepting only the second
    // would have a typed deep link silently show the unfiltered catalog.
    expect(parse({ manufacturer_id: 5 }).manufacturer_id).toEqual([5]);
  });

  it('drops a manufacturer id that is not a number', () => {
    expect(parse({ manufacturer_id: 'abc' }).manufacturer_id).toBeUndefined();
  });

  it('keeps kind as a scalar, not a list', () => {
    expect(parse({ kind: 'component' }).kind).toBe('component');
  });

  it('reports which filters are active', () => {
    expect(activeFilterKeys(parse({}))).toEqual([]);
    expect(activeFilterKeys(parse({ manufacturer_id: [5], kind: 'kit' }))).toEqual([
      'manufacturer_id',
      'kind',
    ]);
  });

  it('counts free-text search as an active filter', () => {
    // The empty state branches on this: "nothing matches" and "nothing here"
    // want different next actions.
    expect(hasActiveFilters(parse({}))).toBe(false);
    expect(hasActiveFilters(parse({ search: 'screw' }))).toBe(true);
  });

  it('does not count a sort as a filter', () => {
    // Sorting an empty result set differently does not make it non-empty, so
    // offering "clear all filters" over a sort would be a dead end.
    expect(hasActiveFilters(parse({ ordering: '-name' }))).toBe(false);
  });
});

describe('catalogLabel', () => {
  it('shows a kit its description', () => {
    expect(catalogLabel(part({ description: 'Lapidus Fixation Set' }))).toBe(
      'Lapidus Fixation Set',
    );
  });

  it('shows a component its description too', () => {
    // One label for both kinds is the point of the fold. This used to be the
    // interesting case: components carried a description and a NULL name, so
    // a column reading `name` was blank for every one of them.
    expect(
      catalogLabel(part({ kind: 'component', description: 'REAMER CANNULATED ACORN 4.5MM' })),
    ).toBe('REAMER CANNULATED ACORN 4.5MM');
  });

  it('ignores the deprecated name alias', () => {
    // `name` is `description` under another key. A row cannot really carry
    // two different values here, but reading the deprecated one would make
    // this table the last thing depending on it.
    expect(catalogLabel(part({ name: 'Stale Alias', description: 'Cortical screw' }))).toBe(
      'Cortical screw',
    );
  });

  it('ignores a description that is only whitespace', () => {
    expect(catalogLabel(part({ description: '   ', reference_number: 'CS-3510' }))).toBe('CS-3510');
  });

  it('falls back to the reference number when there is no label at all', () => {
    expect(catalogLabel(part({ description: '', reference_number: 'CS-3510' }))).toBe('CS-3510');
  });

  it('renders an em dash rather than an empty cell', () => {
    expect(catalogLabel(part({}))).toBe('—');
  });
});
