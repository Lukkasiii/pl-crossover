import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/season", "/model", "/teams", "/teams/arsenal", "/compare", "/method", "/scenarios"];

/**
 * fr tracks default to min-width: auto, so a wide table or chart can hold
 * a grid track open past its fr share and push the page wider than the
 * viewport -- a screenshot doesn't show this, only measuring scrollWidth
 * against innerWidth does. Checked on every route: the sidebar-to-drawer
 * collapse at phone width is exactly the kind of change that silently
 * introduces overflow on routes nobody happened to look at.
 */
async function overflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("layout", () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow at desktop width (${route})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await expect(page.getByTestId("sidebar-nav")).toBeVisible();
      if (route === "/season") {
        await expect(page.locator("table tbody tr").first()).toBeVisible();
        await page.getByTestId("player-toggle").click();
      }

      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test(`no horizontal overflow at phone width (${route})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      if (route === "/season") {
        await expect(page.locator("table tbody tr").first()).toBeVisible();
        await page.getByTestId("player-toggle").click();
      }

      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  // Covers the resize path, not just load-at-size: an ECharts canvas gets an
  // explicit pixel width at init and only shrinks back if its ResizeObserver
  // callback (chart.resize()) actually fires and completes before we measure.
  test("no horizontal overflow when resizing after load (/season)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/season");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.getByTestId("player-toggle").click();

    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
  });
});
