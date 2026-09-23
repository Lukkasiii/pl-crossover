import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PLACEHOLDER_ROUTES = ["/", "/model", "/teams", "/teams/arsenal", "/compare", "/method"];

/**
 * Runs the real WCAG 2 A/AA ruleset (axe-core's default) against every
 * route's shell (sidebar nav + placeholder content) plus two states of
 * /season that render meaningfully different DOM: the page as it loads
 * (toolbar, player controls -- StandingsTable's `rows === null` placeholder,
 * if the scan lands before the stream is ready) and the page once the first
 * frame has landed (adds the table body, per-row aria-labels, zone bands).
 * A one-time manual sweep only catches what a person happened to tab
 * through; this catches a regression on every PR instead.
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
    // The replay lands on frame 0 as soon as it's ready, without a click --
    // nothing is playing yet, so the DOM is already stable for axe to scan.
    await expect(page.locator("table tbody tr").first()).toBeVisible();

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
