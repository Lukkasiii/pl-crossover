import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const DEMO_EMAIL = "demo@plcrossover.dev";
const DEMO_PASSWORD = "crossover-demo";

// The assertions above already prove each step landed the instant it can;
// these beats only exist so a human watching the recording can tell one step
// apart from the next. Set only when producing the README's demo GIF
// (RECORD_DEMO=1 npx playwright test e2e/auth-scenarios.spec.ts) -- plain
// `npm run test:e2e` stays fast.
const RECORD_DEMO = process.env.RECORD_DEMO === "1";
async function beat(page: Page) {
  if (RECORD_DEMO) await page.waitForTimeout(700);
}

// Scenario rows are keyed by server-assigned id, not name, so the spec
// locates them by data-testid prefix + visible text rather than a fixed id.
function scenarioRow(page: Page, name: string) {
  return page.locator('[data-testid^="scenario-row-"]').filter({ hasText: name });
}

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The auth UI has no other window into it: AuthPanel and ScenariosPanel
// return null/a sign-in prompt under DEMO_MODE (no backend behind the
// static demo build), so the deployed demo can never show them. This is the
// one place that can -- recording this spec is how the README's auth
// section gets a real GIF of it working instead of the feature being
// invisible everywhere but a local checkout. A smaller viewport keeps the
// source video (and the GIF made from it) down in size without cropping any
// panel out of frame, and stays above the 720px sidebar-to-drawer
// breakpoint so the sidebar (and AuthPanel inside it) is always visible,
// not behind a drawer toggle.
test.use({ video: "on", viewport: { width: 960, height: 720 } });

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
  await page.goto("/season");

  // --- logged out: the dashboard itself has no login wall -----------------
  // The replay lands on frame 0 as soon as it's ready, without a click.
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await beat(page);

  // --- the prior-weight tuner lives on /model, not /season (see CLAUDE.md's
  // "v2 -- multi-page dashboard / Routes"), but reads and writes the same
  // ReplayParamsContext either way -- the session (and the replay it's
  // reading `games` from) doesn't reset crossing between the two routes. ---
  await page.getByTestId("nav-model").click();
  const sigmaSlider = page.getByTestId("prior-weight-slider");
  await sigmaSlider.focus();
  for (let i = 0; i < 7; i++) await sigmaSlider.press("ArrowRight"); // default 5 -> 12
  await expect(page.getByText(/w_prior = 12\b/)).toBeVisible();

  // --- /scenarios while signed out: a prompt, not the panel ----------------
  await page.getByTestId("nav-scenarios").click();
  await expect(page.getByTestId("scenarios-sign-in-prompt")).toBeVisible();
  await beat(page);

  // --- sign in as the seeded demo account (AuthPanel lives in the sidebar,
  // reachable from every route) ---------------------------------------------
  await page.getByTestId("sign-in-open-button").click();
  const authDialog = page.getByTestId("auth-dialog");
  await authDialog.getByTestId("auth-email-input").fill(DEMO_EMAIL);
  await authDialog.getByTestId("auth-password-input").fill(DEMO_PASSWORD);
  await beat(page);
  await authDialog.getByTestId("auth-submit-button").click();

  await expect(authDialog).toBeHidden();
  await expect(page.getByTestId("account-email")).toHaveText(DEMO_EMAIL);
  await beat(page);

  // --- save the current sigma as a named scenario --------------------------
  await expect(page.getByTestId("scenarios-sign-in-prompt")).toBeHidden();
  await page.getByTestId("scenario-name-input").fill("sigma twelve");
  await beat(page);
  await page.getByTestId("scenario-save-button").click();

  const savedRow = scenarioRow(page, "sigma twelve");
  await expect(savedRow).toContainText("w=12");
  await beat(page);

  // --- reload: the access token is gone, the refresh cookie survives -------
  await page.reload();
  await expect(page.getByTestId("account-email")).toHaveText(DEMO_EMAIL, { timeout: 10_000 });
  const reloadedRow = scenarioRow(page, "sigma twelve");
  await expect(reloadedRow).toContainText("w=12");

  // ReplayParamsContext (not server state) resets on reload -- confirms the
  // "Load" below is what restores 12, not a value that never left the page.
  // /season is where the replay actually lives; confirm it survived the
  // reload before checking the tuner (on /model) that reads its games count.
  await page.getByTestId("nav-season").click();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await page.getByTestId("nav-model").click();
  await expect(page.getByText(/w_prior = 5\b/)).toBeVisible();
  await beat(page);

  // --- load restores the tuned sigma, across the route split ---------------
  await page.getByTestId("nav-scenarios").click();
  const rowBeforeLoad = scenarioRow(page, "sigma twelve");
  await rowBeforeLoad.locator('[data-testid^="scenario-load-"]').click();
  await page.getByTestId("nav-model").click();
  await expect(page.getByText(/w_prior = 12\b/)).toBeVisible();
  await beat(page);

  // --- rename ---------------------------------------------------------------
  await page.getByTestId("nav-scenarios").click();
  const rowToRename = scenarioRow(page, "sigma twelve");
  await rowToRename.locator('[data-testid^="scenario-rename-btn-"]').click();
  // Not scoped to a name filter: renaming swaps the name text for an
  // <input>, so a locator still filtering on "sigma twelve" text stops
  // matching the instant editing starts. The input's data-testid is keyed
  // by scenario id, which the row testid also carries, so this derives it
  // from the row rather than needing the id as a separate variable.
  const renameInput = page.locator('[data-testid^="scenario-rename-input-"]');
  await renameInput.fill("aggressive sigma");
  await beat(page);
  await renameInput.press("Enter");

  const renamedRow = scenarioRow(page, "aggressive sigma");
  await expect(renamedRow).toBeVisible();
  await expect(scenarioRow(page, "sigma twelve")).toHaveCount(0);
  await beat(page);

  // --- delete -----------------------------------------------------------------
  await renamedRow.locator('[data-testid^="scenario-delete-"]').click();
  await expect(page.getByTestId("scenarios-empty")).toBeVisible();
  await beat(page);

  // --- sign out: saving disappears, the dashboard keeps working ------------
  await page.getByTestId("sign-out-button").click();
  await expect(page.getByTestId("sign-in-open-button")).toBeVisible();
  await expect(page.getByTestId("scenarios-sign-in-prompt")).toBeVisible();
  await beat(page);

  await page.getByTestId("nav-season").click();
  // The replay starts on a click, sign-out or not -- confirm the toggle
  // still works post-sign-out, from a known, stopped starting state.
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "paused");
  await page.getByTestId("player-toggle").click();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "playing");
  await page.getByTestId("player-toggle").click();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "paused");
  await beat(page);
});
