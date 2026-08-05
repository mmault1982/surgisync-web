import { describe, expect, it } from 'vitest';

import { activeFilterKeys, hasActiveFilters, onHandSearchSchema } from '../on-hand.search';

describe('search schema', () => {
  it('applies defaults for an empty URL', () => {
    const parsed = onHandSearchSchema.parse({});
    expect(parsed).toMatchObject({ page: 1, page_size: 25, ordering: '-created_at' });
  });

  it('accepts the descending default, which the enum has to spell out', () => {
    // OpenAPI cannot express "any of these with an optional '-' prefix", so the
    // backend lists both directions. If it stopped doing so, this fails here
    // rather than 400-ing in production.
    expect(onHandSearchSchema.parse({ ordering: '-expiration_date' }).ordering).toBe(
      '-expiration_date',
    );
  });

  it('degrades a hand-edited URL to defaults instead of throwing', () => {
    // Someone editing a shared link should get their inventory, not an error page.
    const parsed = onHandSearchSchema.parse({
      page: 'banana',
      ordering: 'not_a_column',
      status: ['nonsense'],
      expiration_date_before: '22-04-2026',
    });

    expect(parsed.page).toBe(1);
    expect(parsed.ordering).toBe('-created_at');
    expect(parsed.status).toBeUndefined();
    expect(parsed.expiration_date_before).toBeUndefined();
  });

  it('keeps multi-select filters as arrays', () => {
    const parsed = onHandSearchSchema.parse({ manufacturer_id: [5, 9], status: ['lost'] });
    expect(parsed.manufacturer_id).toEqual([5, 9]);
    expect(parsed.status).toEqual(['lost']);
  });

  it('reports which filters are active', () => {
    const none = onHandSearchSchema.parse({});
    expect(activeFilterKeys(none)).toEqual([]);
    expect(hasActiveFilters(none)).toBe(false);

    const filtered = onHandSearchSchema.parse({ status: ['lost'], in_transit: true });
    expect(activeFilterKeys(filtered).sort()).toEqual(['in_transit', 'status']);
    expect(hasActiveFilters(filtered)).toBe(true);
  });

  it('counts free-text search as an active filter', () => {
    // Otherwise an empty result from a search shows the "no inventory yet"
    // copy, which sends someone looking for a data problem that is not there.
    expect(hasActiveFilters(onHandSearchSchema.parse({ search: 'knee' }))).toBe(true);
  });
});

describe('deep links written by hand', () => {
  /**
   * The router JSON-decodes search values, so `?status=lost` arrives as a
   * string while the router's own navigation emits `?status=["lost"]`. Both
   * have to work: an alert or dashboard bucket linking into a pre-filtered
   * table is the FRD's whole reason for URL-held state, and a dropped filter
   * shows the unfiltered list — which looks like it worked.
   */
  it('accepts a single value where a list is expected', () => {
    expect(onHandSearchSchema.parse({ status: 'lost' }).status).toEqual(['lost']);
    expect(onHandSearchSchema.parse({ manufacturer_id: '5' }).manufacturer_id).toEqual([5]);
    expect(onHandSearchSchema.parse({ physical_location: 'Shelf A' }).physical_location).toEqual([
      'Shelf A',
    ]);
  });

  it('still accepts the array form the router emits', () => {
    expect(onHandSearchSchema.parse({ status: ['lost', 'wrapped'] }).status).toEqual([
      'lost',
      'wrapped',
    ]);
  });

  it('drops a single value that is not a valid option', () => {
    expect(onHandSearchSchema.parse({ status: 'nonsense' }).status).toBeUndefined();
  });
});
