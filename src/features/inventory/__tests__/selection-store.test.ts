import { describe, expect, it, vi } from 'vitest';

import {
  clearSelection,
  getSelectedIds,
  subscribe,
  toggleSelected,
  toggleSelectedAll,
} from '../selection-store';

// The store is module scope, so `src/test/setup.ts` clears it in afterEach.
// Without that, these cases would pass or fail depending on their order.

const ids = () => [...getSelectedIds()].sort((a, b) => a - b);

describe('toggleSelected', () => {
  it('adds an id, then removes it', () => {
    toggleSelected(7);
    expect(ids()).toEqual([7]);

    toggleSelected(7);
    expect(ids()).toEqual([]);
  });

  it('keeps unrelated ids alone', () => {
    toggleSelected(1);
    toggleSelected(2);
    toggleSelected(1);

    expect(ids()).toEqual([2]);
  });
});

describe('toggleSelectedAll', () => {
  it('selects every visible id', () => {
    toggleSelectedAll([3, 1, 2]);
    expect(ids()).toEqual([1, 2, 3]);
  });

  it('deselects them once they are all selected', () => {
    toggleSelectedAll([1, 2]);
    toggleSelectedAll([1, 2]);

    expect(ids()).toEqual([]);
  });

  it('completes a partial selection rather than clearing it', () => {
    // A part-selected page must fill, not empty — otherwise ticking one row and
    // then hitting select-all deselects the row you just chose.
    toggleSelected(1);
    toggleSelectedAll([1, 2, 3]);

    expect(ids()).toEqual([1, 2, 3]);
  });

  it('leaves selections made on other pages alone', () => {
    // The store is deliberately ignorant of paging, so clearing the visible
    // page must not reach ids the user selected somewhere else. The prototype's
    // select-all iterates every row it knows about and gets this wrong.
    toggleSelected(99);
    toggleSelectedAll([1, 2]);
    toggleSelectedAll([1, 2]);

    expect(ids()).toEqual([99]);
  });

  it('does nothing for an empty page', () => {
    // `every()` on an empty array is true, so without a length guard an empty
    // result set would read as "all selected" and clear the whole selection.
    toggleSelected(5);
    toggleSelectedAll([]);

    expect(ids()).toEqual([5]);
  });
});

describe('clearSelection', () => {
  it('empties the selection', () => {
    toggleSelectedAll([1, 2, 3]);
    clearSelection();

    expect(ids()).toEqual([]);
  });
});

describe('subscribers', () => {
  it('are notified on every mutation and stop after unsubscribing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    toggleSelected(1);
    toggleSelectedAll([1, 2]);
    clearSelection();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    toggleSelected(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('is not notified by a clear that changes nothing', () => {
    const listener = vi.fn();
    subscribe(listener);

    clearSelection();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the snapshot', () => {
  /**
   * The `useSyncExternalStore` contract, and the reason `getSelectedIds` returns
   * a stored reference rather than building a Set.
   *
   * React compares snapshots by identity. A fresh Set per read is a new
   * reference every time, which React reads as "changed again" and re-renders
   * forever — it surfaces as the tab pegging a CPU core, or as "The result of
   * getSnapshot should be cached to avoid an infinite loop", not as a failing
   * assertion anywhere near the cause.
   */
  it('keeps the same reference until something actually changes', () => {
    const before = getSelectedIds();
    expect(getSelectedIds()).toBe(before);

    toggleSelected(1);
    const after = getSelectedIds();
    expect(after).not.toBe(before);
    expect(getSelectedIds()).toBe(after);
  });

  it('does not expose the store to mutation through the snapshot', () => {
    toggleSelected(1);
    const snapshot = getSelectedIds();

    toggleSelected(2);

    // Each mutation commits a new Set, so a snapshot React already rendered
    // cannot change underneath it.
    expect([...snapshot]).toEqual([1]);
  });
});
