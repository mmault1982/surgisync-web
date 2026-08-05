import { test as base, type BrowserContext } from '@playwright/test';

/**
 * One signed-in browser context per worker.
 *
 * Logging in per test exhausts the backend's login throttle: `web_login` is
 * 10/min and IP-keyed, so a dozen tests in a file 429 partway through and the
 * failures look like bad credentials.
 *
 * A saved `storageState` is not the answer here either — the refresh cookie
 * ROTATES, so a serialized copy is invalidated the moment any test refreshes.
 * Instead each worker signs in once, as its own seeded user (see the backend's
 * seed_inventory_demo), and keeps that context alive for the whole run.
 */
interface Fixtures {
  authedContext: BrowserContext;
}

export const test = base.extend<object, Fixtures>({
  authedContext: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // One user per worker; the seed command creates e2e-0..e2e-3.
      const email =
        process.env.E2E_EMAIL?.replace(/e2e-\d+/, `e2e-${workerInfo.parallelIndex}`) ??
        `e2e-${workerInfo.parallelIndex}@surgisync.test`;

      await page.goto('/login');
      await page.getByPlaceholder('Email address').fill(email);
      await page.getByPlaceholder('Password').fill(process.env.E2E_PASSWORD ?? '');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL(/\/inventory\/on-hand/);
      await page.close();

      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
