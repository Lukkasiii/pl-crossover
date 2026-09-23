import { expect, test } from "@playwright/test";

const BASE = "/pl-crossover";

const ROUTES = [
  { nav: "nav-overview", path: `${BASE}/`, page: "page-overview" },
  { nav: "nav-season", path: `${BASE}/season`, page: "page-season" },
  { nav: "nav-model", path: `${BASE}/model`, page: "page-model" },
  { nav: "nav-teams", path: `${BASE}/teams`, page: "page-teams" },
  { nav: "nav-compare", path: `${BASE}/compare`, page: "page-compare" },
  { nav: "nav-method", path: `${BASE}/method`, page: "page-method" },
  { nav: "nav-scenarios", path: `${BASE}/scenarios`, page: "page-scenarios" },
];

/**
 * Runs against the real GitHub Pages base ("/pl-crossover/"), served by
 * ghPagesStaticServer.mjs so the response semantics (404 status + 404.html
 * content on an unmatched path, no redirect) match production, not
 * `vite preview`'s more permissive built-in fallback. See CLAUDE.md's
 * "Deep links need a static-hosting fallback" and the router-search-param
 * race note -- both bugs were invisible under the dev server's base "/",
 * where a wrong-basename navigation and a correct one are indistinguishable.
 */
test.describe("production base path", () => {
  for (const route of ROUTES) {
    test(`clicking ${route.nav} stays on ${route.path}`, async ({ page }) => {
      await page.goto(`${BASE}/`);
      await page.getByTestId(route.nav).click();
      await expect(page.getByTestId(route.page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route.path);

      // /season is where the bug was actually observed: once playing,
      // and once the first round frame arrives (a few hundred ms to a few
      // seconds in, not immediate), useUrlWeekSync writes ?week= -- that
      // write is what triggered the bounce, so start the replay and wait
      // for the write to actually have happened rather than a fixed delay
      // that could race ahead of it and pass on the broken build for the
      // wrong reason. The replay no longer starts on its own (see
      // CLAUDE.md's autoplay-removal note), so this clicks Play first.
      if (route.nav === "nav-season") {
        await page.getByTestId("player-toggle").click();
        await page.waitForURL(/week=/, { timeout: 10_000 });
      }

      // The reported bug bounced back to "/" a few seconds after a
      // successful navigation. Asserting immediately after the click (or
      // immediately after the ?week= write above) would pass even on the
      // broken build; the URL has to still be correct after more time has
      // passed than the buggy write needed to fire.
      await page.waitForTimeout(2_000);
      expect(new URL(page.url()).pathname).toBe(route.path);
      await expect(page.getByTestId(route.page)).toBeVisible();
    });
  }

  for (const route of ROUTES) {
    test(`a direct hit on ${route.path} renders the right route`, async ({ page }) => {
      const response = await page.goto(route.path);
      if (route.path === `${BASE}/`) {
        // The one path that's a real file (dist/index.html) -- no fallback involved.
        expect(response?.status()).toBe(200);
      } else {
        // Everything else only exists client-side: GitHub Pages (and this
        // server, which reproduces it) has no matching file, so it falls
        // back to serving 404.html's content under a 404 status without
        // changing the URL. The SPA then boots and the router picks the
        // real route up from window.location.
        expect(response?.status()).toBe(404);
      }
      await expect(page.getByTestId(route.page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route.path);
    });
  }
});
