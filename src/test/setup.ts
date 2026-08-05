import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { __resetAuthStoreForTests } from '@/auth/auth-store';

import { server } from './msw/server';

// onUnhandledRequest: 'error' turns "the app called an endpoint nobody mocked"
// into a failing test rather than a hang or a confusing timeout.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // The auth store is module scope, so state leaks between tests unless reset.
  __resetAuthStoreForTests();
});

afterAll(() => server.close());
