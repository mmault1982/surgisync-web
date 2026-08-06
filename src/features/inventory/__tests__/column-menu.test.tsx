import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ColumnMenu } from '../components/column-menu';
import { ON_HAND_DEFAULTS, type OnHandSearch } from '../on-hand.search';

/**
 * Radix's popper measures its trigger and content, and jsdom implements neither
 * ResizeObserver nor the pointer-capture methods it calls on open. Neither is
 * being tested here — the positioning it drives has no layout engine to act on,
 * so `e2e/on-hand.spec.ts` owns that half. These stubs only let the panel mount.
 */
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function renderMenu(search: Partial<OnHandSearch> = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ColumnMenu
        columnKey="ownership_type"
        label="Type"
        search={{ ...ON_HAND_DEFAULTS, ...search }}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );

  return { onChange, user: userEvent.setup() };
}

describe('ColumnMenu', () => {
  it('opens a dialog, not a menu', async () => {
    // Not cosmetic: the panel holds checkboxes and a text input, so menu
    // semantics would be wrong, and `e2e/on-hand.spec.ts` locates it by this
    // role. A DropdownMenu would also swallow typing via its typeahead.
    const { user } = renderMenu();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Type' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles a value by clicking its label, not just the box', async () => {
    // The checkbox is a Radix <button>, and the option text is a sibling
    // <Label htmlFor>. Buttons are labelable, so the click forwards — this is
    // exactly what the e2e filter test does, and it silently stops working if
    // the id/htmlFor pairing is ever dropped.
    const { onChange, user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Type' }));

    await user.click(await screen.findByText('loaned', { exact: true }));

    expect(onChange).toHaveBeenCalledWith({ ownership_type: ['loaned'] });
  });

  it('clears the filter rather than sending an empty array', async () => {
    // An empty array would serialize as a filter matching nothing.
    const { onChange, user } = renderMenu({ ownership_type: ['loaned'] });
    await user.click(screen.getByRole('button', { name: /Type/ }));

    await user.click(await screen.findByText('loaned', { exact: true }));

    expect(onChange).toHaveBeenCalledWith({ ownership_type: undefined });
  });

  it('keeps the sort labels the e2e suite clicks', async () => {
    const { onChange, user } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Type' }));

    await user.click(await screen.findByRole('button', { name: '↑ Asc' }));

    expect(onChange).toHaveBeenCalledWith({ ordering: 'ownership_type' });
  });

  it('shows the active filter count in the trigger', () => {
    renderMenu({ ownership_type: ['loaned', 'owned'] });

    // The badge is inside the trigger, so it becomes part of the accessible
    // name — which is why the e2e selectors match on a substring.
    expect(screen.getByRole('button', { name: /Type/ })).toHaveTextContent('2');
  });
});
