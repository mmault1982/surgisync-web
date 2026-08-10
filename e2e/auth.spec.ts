import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/**
 * Sign out lives in the sidebar's user menu, so it is a `menuitem` behind a
 * trigger rather than a top-level button.
 *
 * The trigger is matched on its sr-only "Account menu" text: its visible label
 * is the seeded user's name and email, which differs per worker. `nav-user.tsx`
 * carries that text for exactly this reason, and the unit test matches the same
 * string, so the two move together.
 */
const userMenu = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /Account menu/ });

async function signOut(page: import('@playwright/test').Page) {
  await userMenu(page).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

test('signs in and lands on the inventory screen', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/inventory\/on-hand/);
});

test('the session survives a reload', async ({ page }) => {
  // The point of the test: the access token is in memory only, so surviving a
  // reload proves the httpOnly cookie was set, returned, and exchanged.
  await signIn(page);
  await expect(page).toHaveURL(/\/inventory\/on-hand/);

  await page.reload();

  await expect(page).toHaveURL(/\/inventory\/on-hand/);
  await expect(userMenu(page)).toBeVisible();
});

test('the refresh token is never readable by scripts', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/inventory\/on-hand/);

  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).not.toContain('sc_refresh');

  const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(stored).not.toContain('refresh');
});

test('signing out ends the session across a reload', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/inventory\/on-hand/);

  await signOut(page);
  await expect(page).toHaveURL(/\/login/);

  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test('a wrong password shows an inline error and does not navigate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(EMAIL);
  await page.getByPlaceholder('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
  await expect(page).toHaveURL(/\/login/);
});
