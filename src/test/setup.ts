import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { __resetAuthStoreForTests } from '@/auth/auth-store';
import { clearSelection } from '@/features/inventory/selection-store';

import { server } from './msw/server';

// onUnhandledRequest: 'error' turns "the app called an endpoint nobody mocked"
// into a failing test rather than a hang or a confusing timeout.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

/*
 * jsdom implements no `matchMedia` at all, and the sidebar's `useIsMobile()`
 * calls it on mount — so without this, every test that renders anything inside
 * the app shell throws. Global rather than per-file (unlike the ResizeObserver
 * and pointer-capture stubs, which are about one specific Radix popper): this
 * is a flat capability gap, not a component's quirk.
 *
 * jsdom's window is 1024px wide, so the desktop branch is what renders. The
 * mobile Sheet is Playwright's problem, not jsdom's.
 */
beforeAll(() => {
  // Assigned, not `??=`: jsdom defines nothing to fall back to, and reading the
  // property to test it trips `@typescript-eslint/unbound-method`.
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Both stores are module scope, so state leaks between tests unless reset.
  __resetAuthStoreForTests();
  clearSelection();
});

afterAll(() => server.close());
