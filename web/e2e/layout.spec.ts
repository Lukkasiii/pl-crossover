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

  // Regression test for a real defect (see CLAUDE.md's /next notes): the
  // player bar used to sit in normal document flow below the season/RMSE
  // panels, so the standings table swapping its short placeholder for
  // twenty real rows pushed it -- and an already-open speed-select popper
  // -- down by ~600px with no reposition (Radix's default "optimized"
  // strategy only reacts to scroll/resize events, and a sibling growing via
  // plain reflow fires neither). Fixing the player bar to the bottom of the
  // viewport (see .player-controls in App.css) removes it from that flow
  // entirely, so this can no longer happen structurally; this test locks
  // that in rather than the specific old mechanism.
  test("the player bar and its open speed dropdown stay put while the standings table grows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/season");

    const barBefore = await page.getByTestId("player-toggle").boundingBox();
    await page.getByTestId("player-toggle").click(); // enables speed-select
    await page.getByTestId("speed-select").click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const contentBefore = await page.getByRole("listbox").boundingBox();

    // Let the table grow from its placeholder to twenty real rows underneath.
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.waitForTimeout(200);

    const barAfter = await page.getByTestId("player-toggle").boundingBox();
    const contentAfter = await page.getByRole("listbox").boundingBox();
    expect(barAfter!.y).toBe(barBefore!.y);
    expect(contentAfter!.y).toBe(contentBefore!.y);
  });
});
