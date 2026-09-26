import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Saving the same four parameters under a second name warns first (and
 * then lets you, if you mean it); a name that's already taken is refused,
 * on save and on rename. Runs against the real API with a fresh account.
 */
const API = "http://localhost:8000";
const PASSWORD = "duplicate-check-password";

async function signInFresh(page: Page) {
  const email = `dupes-${crypto.randomUUID().slice(0, 8)}@example.dev`;
  const res = await page.request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/scenarios");
  const form = page.getByTestId("scenarios-sign-in-prompt");
  await form.getByTestId("auth-email-input").fill(email);
  await form.getByTestId("auth-password-input").fill(PASSWORD);
  await form.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("account-email")).toHaveAttribute("title", email);
}

const rows = (page: Page) => page.locator('[data-testid^="scenario-row-"]');

async function save(page: Page, name: string) {
  await page.getByTestId("scenario-name-input").fill(name);
  await page.getByTestId("scenario-save-button").click();
}

test("same settings under a new name: warned, then saved only if confirmed", async ({ page }) => {
  await signInFresh(page);
  await save(page, "Aggressive prior");
  await expect(rows(page)).toHaveCount(1);

  await save(page, "Second name");
  const warning = page.getByTestId("scenario-duplicate-warning");
  await expect(warning).toContainText("“Aggressive prior” already has these settings");
  await expect(rows(page)).toHaveCount(1);

  const axe = await new AxeBuilder({ page }).include('[data-testid="page-scenarios"]').analyze();
  expect(axe.violations).toEqual([]);

  await page.getByTestId("scenario-save-cancel").click();
  await expect(warning).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);

  await page.getByTestId("scenario-save-button").click();
  await page.getByTestId("scenario-save-anyway").click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "Second name" })).toHaveCount(1);
});

test("a taken name is refused on save and on rename", async ({ page }) => {
  await signInFresh(page);
  await save(page, "baseline");
  await expect(rows(page)).toHaveCount(1);

  await save(page, "baseline");
  await expect(page.getByTestId("scenario-name-taken")).toContainText("“baseline” already exists");
  await expect(page.getByTestId("scenario-duplicate-warning")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);

  // Give the second scenario different settings so the rename check is
  // about the name alone: on /model, nudge w_prior, then come back.
  await page.getByTestId("nav-model").click();
  const slider = page.getByTestId("prior-weight-slider");
  await slider.focus();
  await slider.press("ArrowRight");
  await page.getByTestId("nav-scenarios").click();
  await save(page, "other");
  await expect(rows(page)).toHaveCount(2);

  const other = rows(page).filter({ hasText: "other" });
  await other.locator('[data-testid^="scenario-rename-btn-"]').click();
  const input = page.locator('[data-testid^="scenario-rename-input-"]');
  await input.fill("baseline");
  await input.press("Enter");
  await expect(page.locator('[data-testid^="scenario-rename-taken-"]')).toContainText("“baseline” already exists");
  await input.press("Escape");
  await expect(rows(page).filter({ hasText: "other" })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "baseline" })).toHaveCount(1);
});
