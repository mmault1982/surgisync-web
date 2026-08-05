import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real backend.
 *
 * These exist for the things MSW cannot model: httpOnly cookies, `Path=` and
 * host-only scoping, and refresh-token rotation. Everything deterministic is a
 * Vitest test instead — see src/**\/__tests__.
 *
 * Not yet part of `pnpm verify` or CI: they need seeded inventory and one user
 * per worker, which is being added backend-side. `pnpm test:e2e` runs them
 * locally against a seeded stack.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,

  // Serial for now. Parallel workers need one seeded user each: web_login is
  // 10/min and IP-keyed, and the refresh cookie rotates, so workers cannot
  // share a storageState — the first rotation invalidates it for the rest.
  fullyParallel: false,
  workers: 1,

  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
