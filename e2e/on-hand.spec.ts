import { expect, test } from './fixtures';

// Every test reuses the worker's signed-in context; see fixtures.ts for why
// per-test login and saved storageState both fail here.
//
// The fixture deliberately does NOT navigate: a test that then goes somewhere
// else would be racing two page loads, and the table would intermittently show
// the first one's results.
test.use({
  page: async ({ authedContext }, use) => {
    const page = await authedContext.newPage();
    await use(page);
    await page.close();
  },
});

const ON_HAND = '/inventory/on-hand';

test('renders seeded stock', async ({ page }) => {
  await page.goto(ON_HAND);
  await expect(page.getByRole('heading', { name: 'Manage On-Hand' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('a deep link renders pre-filtered rows on first paint', async ({ page }) => {
  // The property that matters: URL -> API params -> server-side filtering,
  // including the repeated-key serialization for array params.
  await page.goto('/inventory/on-hand?status=lost');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Active filters')).toBeVisible();
});

test('two statuses return the union, not the intersection', async ({ page }) => {
  // The whole reason the backend gained a `status` param: the equivalent
  // is_lost=true&is_wrapped=true asks for both and returns nothing.
  await page.goto('/inventory/on-hand?status=lost&status=wrapped');

  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('changing a filter updates the URL and the rows', async ({ page }) => {
  await page.goto(ON_HAND);
  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('menu').getByText('loaned', { exact: true }).click();

  // The router URL-encodes its arrays, so assert on the decoded URL rather
  // than the literal — otherwise the test pins an encoding detail, not intent.
  await expect.poll(() => decodeURIComponent(page.url())).toContain('ownership_type=["loaned"]');
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('sorting puts the ordering in the URL', async ({ page }) => {
  await page.goto(ON_HAND);
  await page.getByRole('button', { name: 'Kit Name' }).click();
  await page.getByRole('button', { name: '↑ Asc' }).click();

  await expect.poll(() => decodeURIComponent(page.url())).toContain('ordering=part_name');
  const firstCell = page.locator('tbody tr').first().locator('td').nth(2);
  await expect(firstCell).toHaveText('Accolade Hip Stem');
});

test('an empty result explains itself and offers a way out', async ({ page }) => {
  // Easy to hit accidentally with ten filter dimensions; the prototype shows
  // a bare table with a footer still claiming the unfiltered count.
  await page.goto('/inventory/on-hand?search=nothingmatchesthis');

  await expect(page.getByText('No kits match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('select-all covers only the visible rows and shows a count', async ({ page }) => {
  await page.goto(ON_HAND);
  await page.getByLabel('Select all rows on this page').check();
  await expect(page.getByText('8 selected')).toBeVisible();
});
