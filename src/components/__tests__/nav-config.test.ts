import { describe, expect, it } from 'vitest';

import { NAV_SECTIONS, findNavTrail } from '../nav-config';

describe('findNavTrail', () => {
  it('locates a child and its parent section', () => {
    const trail = findNavTrail('/inventory/on-hand');

    expect(trail?.section.title).toBe('Inventory');
    expect(trail?.item.title).toBe('Manage On-Hand');
  });

  it('resolves every configured item', () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        expect(findNavTrail(item.to)?.item).toBe(item);
      }
    }
  });

  it('returns null off the nav', () => {
    // The breadcrumb renders nothing rather than a stale crumb.
    expect(findNavTrail('/login')).toBeNull();
    expect(findNavTrail('/inventory')).toBeNull();
  });

  it('does not match a longer path that merely starts the same', () => {
    // A future /inventory/on-hand/123 is a detail view, not this screen — a
    // prefix match would light up the wrong nav item and breadcrumb.
    expect(findNavTrail('/inventory/on-hand/123')).toBeNull();
  });

  it('has no duplicate targets', () => {
    // Two items sharing a path would both render active.
    const targets = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.to));
    expect(new Set(targets).size).toBe(targets.length);
  });
});
