import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end tests against the live backend configured in src/config/env.ts
 * (nomad.local:8000 via the Vite dev-server proxy) — the backend must be
 * running. Mirrors the iOS spike's LoginFlowUITests.
 *
 * Each test gets a fresh browser context, so localStorage starts clean.
 */

const EMAIL = "admin@example.com";
const PASSWORD = "Test@123";

async function signIn(page: Page, email: string, password: string) {
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

test("wrong password shows inline error", async ({ page }) => {
  await page.goto("/");
  await signIn(page, EMAIL, "wrong-password");
  await expect(page.getByText("Invalid email or password.")).toBeVisible({
    timeout: 10_000,
  });
});

test("login persists across reload and logs out", async ({ page }) => {
  await page.goto("/");
  await signIn(page, EMAIL, PASSWORD);
  await expect(page.getByRole("heading", { name: "Representatives" })).toBeVisible({
    timeout: 10_000,
  });

  // Reload: refresh token in localStorage should keep us signed in.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Representatives" })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByPlaceholder("Email address")).toBeVisible();

  // And logged-out state should also survive a reload.
  await page.reload();
  await expect(page.getByPlaceholder("Email address")).toBeVisible();
});

test("signed-in list has representative rows", async ({ page }) => {
  await page.goto("/");
  await signIn(page, EMAIL, PASSWORD);
  await expect(page.getByRole("heading", { name: "Representatives" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("rep-row").first()).toBeVisible({ timeout: 10_000 });
});
