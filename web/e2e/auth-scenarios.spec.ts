import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "demo@plcrossover.dev";
const DEMO_PASSWORD = "crossover-demo";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test.beforeAll(() => {
  // data/pl.db ships with no account rows (a6fec41) -- a fresh checkout has
  // nothing for the demo credentials below to log into. seed_demo_account.py
  // is idempotent (resets the password if the row already exists), so this
  // is safe to run alongside every other e2e spec sharing the same db.
  //
  // PL_DB_PATH points this at playwright.config.ts's scratch copy of the db,
  // not the tracked one -- the webServer it starts uses the same copy, so
  // seeding and every request in this spec agree on which file has the row.
  execFileSync(path.join(REPO_ROOT, ".venv", "bin", "python"), [
    path.join(REPO_ROOT, "scripts", "seed_demo_account.py"),
  ], { env: { ...process.env, PL_DB_PATH: path.join(REPO_ROOT, "data", ".e2e-pl.db") } });
});

test("auth and saved scenarios round trip", async ({ page }) => {
  await page.goto("/");

  // --- logged out: the dashboard itself has no login wall -----------------
  await page.getByRole("button", { name: /play/i }).click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await page.getByRole("button", { name: /pause/i }).click();

  const sigmaSlider = page.getByRole("slider", { name: "prior weight" });
  await sigmaSlider.focus();
  for (let i = 0; i < 7; i++) await sigmaSlider.press("ArrowRight"); // default 5 -> 12
  await expect(page.getByText(/w_prior = 12\b/)).toBeVisible();

  await expect(page.getByRole("heading", { name: "Saved scenarios" })).toHaveCount(0);

  // --- sign in as the seeded demo account ----------------------------------
  // Before the popover opens, "Sign in" only matches this one button --
  // once it's open, the tab and the submit button reuse the same label, so
  // later lookups are scoped to the dialog (see below) to stay unambiguous.
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.getByRole("dialog", { name: "Sign in" });
  await authDialog.getByLabel("Email").fill(DEMO_EMAIL);
  await authDialog.getByLabel("Password").fill(DEMO_PASSWORD);
  await authDialog.getByRole("button", { name: "Sign in" }).click();

  await expect(authDialog).toBeHidden();
  await expect(page.getByText(DEMO_EMAIL)).toBeVisible();

  // --- save the current sigma as a named scenario --------------------------
  await page.getByLabel("scenario name").fill("sigma twelve");
  await page.getByRole("button", { name: "Save current" }).click();

  const savedRow = page.getByRole("listitem").filter({ hasText: "sigma twelve" });
  await expect(savedRow).toContainText("w=12");

  // --- reload: the access token is gone, the refresh cookie survives -------
  await page.reload();
  await expect(page.getByText(DEMO_EMAIL)).toBeVisible({ timeout: 10_000 });
  // App state (not session state) resets on reload -- confirms the next
  // "Load" is what restores 12, not a value that never left.
  await expect(page.getByText(/w_prior = 5\b/)).toBeVisible();

  const reloadedRow = page.getByRole("listitem").filter({ hasText: "sigma twelve" });
  await expect(reloadedRow).toContainText("w=12");

  // --- load restores the tuned sigma ---------------------------------------
  await reloadedRow.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/w_prior = 12\b/)).toBeVisible();

  // --- rename ---------------------------------------------------------------
  await reloadedRow.getByRole("button", { name: "Rename" }).click();
  // Not scoped to reloadedRow: renaming swaps the name text for an <input>,
  // so a locator still filtering on "sigma twelve" text stops matching the
  // instant editing starts. ScenariosPanel labels the input "rename <name>".
  const renameInput = page.getByRole("textbox", { name: "rename sigma twelve" });
  await renameInput.fill("aggressive sigma");
  await renameInput.press("Enter");

  const renamedRow = page.getByRole("listitem").filter({ hasText: "aggressive sigma" });
  await expect(renamedRow).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "sigma twelve" })).toHaveCount(0);

  // --- delete -----------------------------------------------------------------
  await renamedRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("no saved scenarios yet")).toBeVisible();

  // --- sign out: saving disappears, the dashboard keeps working ------------
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved scenarios" })).toHaveCount(0);

  await page.getByRole("button", { name: /play/i }).click();
  await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
});
