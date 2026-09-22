import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PLACEHOLDER_ROUTES = ["/", "/model", "/teams", "/teams/arsenal", "/compare", "/method"];

/**
 * Runs the real WCAG 2 A/AA ruleset (axe-core's default) against every
 * route's shell (sidebar nav + placeholder content) plus two states of
 * /season that render meaningfully different DOM: the page as it loads
 * (toolbar, player controls, prior-weight tuner -- StandingsTable's
 * `rows === null` placeholder, if the scan lands before autoplay's first
 * frame arrives) and the page after a few frames have streamed in (adds
 * the table body, per-row aria-labels, zone bands). A one-time manual
 * sweep only catches what a person happened to tab through; this catches
 * a regression on every PR instead.
 */
test.describe("accessibility", () => {
  for (const route of PLACEHOLDER_ROUTES) {
    test(`${route || "/"} has no axe violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("sidebar-nav")).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("/season initial load has no axe violations", async ({ page }) => {
    await page.goto("/season");
    await expect(page.getByTestId("season-pair-select")).toBeEnabled();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/season populated standings table has no axe violations", async ({ page }) => {
    await page.goto("/season");
    // Autoplay (see ReplayDashboard) fills the table in on its own.
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    // Freeze the replay so axe scans a stable DOM instead of racing FLIP
    // reorders and tweened points text.
    await page.getByTestId("player-toggle").click();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/scenarios (signed out) has no axe violations", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByTestId("scenarios-sign-in-prompt")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
