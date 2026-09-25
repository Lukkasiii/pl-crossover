import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/overview", "/season", "/model", "/teams", "/teams/arsenal", "/compare", "/method", "/scenarios"];

/**
 * fr tracks default to min-width: auto, so a wide table or chart can hold
 * a grid track open past its fr share and push the page wider than the
 * viewport -- a screenshot doesn't show this, only measuring scrollWidth
 * against innerWidth does. Checked on every route: the sidebar-to-drawer
 * collapse at phone width is exactly the kind of change that silently
 * introduces overflow on routes nobody happened to look at.
 *
 * Widths swept: 1440 (desktop) and 390 (phone) alone missed a real overflow
 * bug on /teams/arsenal. The sidebar collapses to a drawer at phone width,
 * removing its track from the grid entirely, and the grid still has slack
 * at 1440; the failure sits in the band between, where the sidebar is still
 * a grid column but the column it leaves for content is already narrower
 * than a wide table's natural width. Measured on the deployed pre-fix site
 * (scrollWidth - innerWidth, /teams/arsenal): 1440px -> 0, 1024px -> 39,
 * 803px -> 260. 1024 and 900 both sit in that band and are swept on every
 * route, not just the one where the bug was found.
 *
 * Widths alone were not the whole gap, though: this route's table renders
 * behind an async fetch (TeamDetail.tsx returns a loading placeholder until
 * useTeamSeasons resolves), and the old test measured right after goto(),
 * before that fetch settled -- so it was checking the loading placeholder's
 * width, not the table's, at *any* width. Confirmed by instrumenting this
 * spec: without a settle wait, /teams/arsenal read 0 overflow at all four
 * of 1440/1024/900/390; with one, it read 0/39/163/445 -- the real bug was
 * present even at 390, just never measured. So every route below now waits
 * for its network activity to settle before measuring, not only /season
 * (which already had its own wait, via the visible-table assertion below --
 * not reused here because /season holds an open replay WebSocket that never
 * goes idle, so "networkidle" would hang on that route specifically).
 */
const WIDTHS = [1440, 1024, 900, 390] as const;

async function overflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("layout", () => {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      test(`no horizontal overflow at ${width}px (${route})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        // The sidebar collapses to a drawer at max-width: 720px (Sidebar.css);
        // above that it's a normal visible column at every width swept here.
        if (width > 720 && route !== "/") {
          await expect(page.getByTestId("sidebar-nav")).toBeVisible();
        }
        if (route === "/season") {
          await expect(page.locator("table tbody tr").first()).toBeVisible();
          await page.getByTestId("player-toggle").click();
        } else {
          // See the WIDTHS comment above: every other route needs its async
          // fetch to have actually settled before scrollWidth means anything.
          await page.waitForLoadState("networkidle");
        }

        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });
    }
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
