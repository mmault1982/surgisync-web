import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
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
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Sign out' }).click();
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
