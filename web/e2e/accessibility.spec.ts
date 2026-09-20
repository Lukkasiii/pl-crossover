import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Runs the real WCAG 2 A/AA ruleset (axe-core's default) against two states
 * that render meaningfully different DOM: the page as it loads (toolbar,
 * player controls, prior-weight tuner -- StandingsTable's `rows === null`
 * placeholder, if the scan lands before autoplay's first frame arrives) and
 * the page after a few frames have streamed in (adds the table body,
 * per-row aria-labels, zone bands). A one-time manual sweep only catches
 * what a person happened to tab through; this catches a regression on every
 * PR instead.
 */
test.describe("accessibility", () => {
  test("initial load has no axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("combobox", { name: "season pair" })).toBeEnabled();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the populated standings table has no axe violations", async ({ page }) => {
    await page.goto("/");
    // Autoplay (see ReplayDashboard) fills the table in on its own.
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    // Freeze the replay so axe scans a stable DOM instead of racing FLIP
    // reorders and tweened points text.
    await page.getByRole("button", { name: /pause/i }).click();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
