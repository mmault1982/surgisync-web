import { describe, expect, it } from 'vitest';

import { NAV_SECTIONS, findNavSubtree, findNavTrail } from '../nav-config';

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

  it('locates the Directory Profiles section', () => {
    // The second section, and the first one whose parent is not Inventory —
    // so this also covers that section lookup is not hardcoded to one entry.
    const trail = findNavTrail('/directory/manufacturers');

    expect(trail?.section.title).toBe('Directory Profiles');
    expect(trail?.item.title).toBe('Manufacturers');
  });

  it('returns null off the nav', () => {
    // The breadcrumb renders nothing rather than a stale crumb.
    expect(findNavTrail('/login')).toBeNull();
    expect(findNavTrail('/inventory')).toBeNull();
    expect(findNavTrail('/directory')).toBeNull();
  });

  it('does not match a longer path that merely starts the same', () => {
    // /inventory/on-hand/123 is a detail view, not this screen. That question
    // is findNavSubtree's — see below.
    expect(findNavTrail('/inventory/on-hand/123')).toBeNull();
  });

  it('has no duplicate targets', () => {
    // Two items sharing a path would both render active.
    const targets = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.to));
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe('findNavSubtree', () => {
  it('resolves a detail screen to the item it lives under', () => {
    // Kit Detail is not in the nav, but Manage On-Hand should stay highlighted
    // while you are on it, and the breadcrumb should still read through it.
    const trail = findNavSubtree('/inventory/on-hand/123');

    expect(trail?.section.title).toBe('Inventory');
    expect(trail?.item.title).toBe('Manage On-Hand');
  });

  it('still resolves the item itself', () => {
    expect(findNavSubtree('/inventory/on-hand')?.item.title).toBe('Manage On-Hand');
  });

  it('does not match a sibling that merely shares a prefix', () => {
    // The trailing slash in the prefix test is the whole guard: without it, a
    // future /inventory/on-hand-archive would light up Manage On-Hand.
    expect(findNavSubtree('/inventory/on-hand-archive')).toBeNull();
  });

  it('returns null off the nav', () => {
    expect(findNavSubtree('/login')).toBeNull();
    expect(findNavSubtree('/inventory')).toBeNull();
  });
});
