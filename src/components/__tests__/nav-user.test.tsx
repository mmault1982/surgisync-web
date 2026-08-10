import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { WebUser } from '@/api/generated/model';
import { SidebarProvider } from '@/components/ui/sidebar';

import { NavUser } from '../nav-user';

/**
 * Same stubs as `column-menu.test.tsx`: Radix's popper measures its trigger and
 * calls pointer-capture methods on open, and jsdom implements neither. The
 * positioning they drive has no layout engine to act on, so `e2e/auth.spec.ts`
 * owns that half — these only let the menu mount.
 *
 * `window.matchMedia` is stubbed globally in `src/test/setup.ts` instead: every
 * test that touches the shell needs it, not just this one.
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

const ADA: WebUser = {
  id: 1,
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  role: null,
  organization_name: null,
  organizations: [],
};

function renderNavUser(user: WebUser | null = ADA) {
  const onSignOut = vi.fn();

  render(
    <SidebarProvider>
      <NavUser user={user} onSignOut={onSignOut} />
    </SidebarProvider>,
  );

  return { onSignOut, user: userEvent.setup() };
}

describe('NavUser', () => {
  it('shows who is signed in', () => {
    renderNavUser();

    const trigger = screen.getByRole('button', { name: /Account menu/ });
    expect(trigger).toHaveTextContent('Ada Lovelace');
    expect(trigger).toHaveTextContent('ada@example.com');
  });

  it('keeps sign-out behind the trigger', async () => {
    // This is why e2e/auth.spec.ts can no longer assert on a visible "Sign out"
    // button: it is a menuitem that does not exist until the menu opens.
    const { user } = renderNavUser();
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Account menu/ }));

    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('signs out once when the item is selected', async () => {
    const { onSignOut, user } = renderNavUser();
    await user.click(screen.getByRole('button', { name: /Account menu/ }));

    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders a session whose profile is missing', () => {
    // The cached profile can be absent while the session is healthy — and it is
    // briefly null mid-sign-out, after the store emits and before we navigate.
    renderNavUser(null);

    expect(screen.getByRole('button', { name: /Account menu/ })).toHaveTextContent('Signed in');
  });
});
