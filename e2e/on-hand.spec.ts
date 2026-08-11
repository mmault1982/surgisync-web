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
  await page.locator('thead').getByRole('button', { name: 'Type' }).click();
  await page.getByRole('dialog').getByText('loaned', { exact: true }).click();

  // The router URL-encodes its arrays, so assert on the decoded URL rather
  // than the literal — otherwise the test pins an encoding detail, not intent.
  await expect.poll(() => decodeURIComponent(page.url())).toContain('ownership_type=["loaned"]');
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('sorting puts the ordering in the URL', async ({ page }) => {
  await page.goto(ON_HAND);
  await page.locator('thead').getByRole('button', { name: 'Kit Name' }).click();
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

test('a filter menu is fully visible, not clipped by the table', async ({ page }) => {
  // Regression: the panel was absolutely positioned inside the table's
  // `overflow-x-auto` wrapper. Per the CSS spec, one non-visible overflow axis
  // makes the other compute to `auto`, so the container clipped it vertically
  // and its lower options were unreachable. It renders in a portal now.
  //
  // Asserting on boundingBox() does NOT catch this: the layout box is unchanged
  // by ancestor clipping, and Playwright scrolls an element into view before
  // clicking it, so even a cut-off option is clickable from a test. The only
  // thing that reflects what a user can actually see is hit-testing the pixel:
  // elementFromPoint near the panel's bottom edge must land inside the panel.
  // Filtered to a single row on purpose: the clipping ancestor is the table
  // wrapper, whose height is its content, so the bug only shows when the panel
  // is taller than the table. A full page of rows hides it.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ON_HAND}?status=lost`);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.locator('thead').getByRole('button', { name: 'Status' }).click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();

  const hit = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const probe = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.bottom - 4, // just inside the lower edge
    );
    return {
      insidePanel: element.contains(probe),
      landedOn: probe?.className ?? null,
    };
  });

  expect(hit.insidePanel, `bottom of the menu is covered by ${hit.landedOn}`).toBe(true);
});

test('a filter menu near the right edge stays on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(ON_HAND);

  // Last Seen is the rightmost column, so its menu would overflow if the
  // position were not clamped.
  await page.locator('thead').getByRole('button', { name: 'Last Seen' }).click();
  const box = await page.getByRole('dialog').boundingBox();

  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('clicking a row opens its kit detail', async ({ page }) => {
  await page.goto(ON_HAND);

  // The Kit Name cell, not the Kit ID one: that column holds the <Link>, so
  // clicking it would pass even if the row handler were broken. This is the
  // "clicking on any row" behaviour.
  const firstRow = page.locator('tbody tr').first();
  const kitName = await firstRow.locator('td').nth(2).textContent();
  await firstRow.locator('td').nth(2).click();

  await expect(page).toHaveURL(/\/inventory\/on-hand\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Kit Detail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: kitName!.trim() })).toBeVisible();

  // The detail route is not in the nav, so both of these come from
  // findNavSubtree plus the route's staticData rather than from a nav entry.
  await expect(page.getByRole('link', { name: 'Manage On-Hand' }).first()).toBeVisible();
  await expect(page.getByText('Kit Detail', { exact: true }).last()).toBeVisible();
});

test('a row click does not fire when selecting the row', async ({ page }) => {
  // The checkbox cell stops propagation; without it, ticking a row to bulk-act
  // on it navigates away from the table instead.
  await page.goto(ON_HAND);
  await page.locator('tbody tr').first().getByRole('checkbox').check();

  await expect(page).toHaveURL(new RegExp(`${ON_HAND}$`));
  await expect(page.getByText('1 selected')).toBeVisible();
});

test('the actions block moves below the kit info on a narrow layout', async ({ page }) => {
  // jsdom has no layout engine, so a container query is only ever provable
  // here — the same reason the filter-menu clipping test lives in this file.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(ON_HAND);
  await page.locator('tbody tr').first().locator('td').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Kit Detail' })).toBeVisible();

  const activity = page.getByRole('heading', { name: 'Recent Activity' });
  const actions = page.getByRole('heading', { name: 'Actions' });

  // Wide: a second column, so Actions starts a long way to the right.
  const wideActivity = (await activity.boundingBox())!;
  const wideActions = (await actions.boundingBox())!;
  expect(wideActions.x - wideActivity.x).toBeGreaterThan(200);

  // Narrow: one column, with Actions between the kit info and Recent Activity.
  await page.setViewportSize({ width: 800, height: 900 });
  const narrowActivity = (await activity.boundingBox())!;
  const narrowActions = (await actions.boundingBox())!;

  // Not exactly equal: the Actions label sits at the column edge while the
  // Recent Activity heading is inset by CardHeader's padding. What matters is
  // that the gap is padding-sized rather than column-sized.
  expect(Math.abs(narrowActions.x - narrowActivity.x)).toBeLessThan(32);
  expect(narrowActions.y).toBeLessThan(narrowActivity.y);
});

test('a selection survives opening a kit and coming back', async ({ page }) => {
  // The reason selection lives in a module-scope store rather than useState.
  // Opening a kit unmounts the on-hand route, so component state would take the
  // selection with it — select seven kits, click one to check its detail, lose
  // all seven. MSW cannot model this: it needs a real unmount and remount.
  await page.goto(ON_HAND);
  const rows = page.locator('tbody tr');

  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  await expect(page.getByText('2 selected')).toBeVisible();

  // A third row, so the navigation is not itself one of the selected ones.
  await rows.nth(2).locator('td').nth(2).click();
  await expect(page).toHaveURL(/\/inventory\/on-hand\/\d+$/);

  // Waiting for the detail content, not just the URL, is load-bearing. The URL
  // changes at the *start* of the navigation, so asserting only on it and
  // immediately going back reverses the transition before React commits the
  // unmount — the list component is never torn down, and the test passes
  // against the very bug it exists to catch. Verified: with the selection back
  // in useState, this line is the difference between a green run and a red one.
  await expect(page.getByRole('heading', { name: 'Kit Detail' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(0);

  await page.goBack();
  await expect(rows.nth(0).getByRole('checkbox')).toBeChecked();
  await expect(rows.nth(1).getByRole('checkbox')).toBeChecked();
  await expect(page.getByText('2 selected')).toBeVisible();
});
