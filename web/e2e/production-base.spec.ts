import { expect, test } from "@playwright/test";

const BASE = "/pl-crossover";

const ROUTES = [
  { nav: "nav-overview", path: `${BASE}/overview`, page: "page-overview" },
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
      await page.goto(`${BASE}/overview`);
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
      // Every route here is one of the eight scripts/prerender-routes.mjs
      // covers (or the root, which is dist/index.html itself) -- a real
      // dist/<route>/index.html file exists for each, so GitHub Pages'
      // directory-index resolution serves it directly as a genuine 200,
      // no 404.html fallback involved. /teams/:slug, which isn't in this
      // list, is the one still relying on that fallback.
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId(route.page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route.path);
    });
  }

  // Entering from the cover navigates to "/overview" through the router;
  // under the real basename a wrong-basename navigate() is exactly the
  // failure only this config can see (see useUrlParamWriter's history).
  test("the root serves the cover, and entering it lands on the real Overview path", async ({ page }) => {
    const response = await page.goto(`${BASE}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("page-cover")).toBeVisible();
    await page.getByTestId("cover-enter").click();
    await expect(page.getByTestId("page-overview")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`${BASE}/overview`);
  });

  test("known routes carry their own <title> in the raw HTML, not just after the SPA boots", async ({ request }) => {
    // A crawler or link-unfurler never runs the SPA's JS, which is what
    // sets document.title per route (see each page's useEffect) -- the
    // only title it will ever see is whatever prerender-routes.mjs already
    // baked into the response body. Fetched directly (no browser, no JS),
    // which is exactly what such a client does.
    const rootBody = await (await request.get(`${BASE}/`)).text();
    const rootTitle = rootBody.match(/<title>([^<]*)<\/title>/)?.[1];
    expect(rootTitle).toBeTruthy();

    for (const route of ROUTES.filter((r) => r.path !== `${BASE}/`)) {
      const body = await (await request.get(route.path)).text();
      const title = body.match(/<title>([^<]*)<\/title>/)?.[1];
      expect(title, `${route.path} has no <title> in its raw response`).toBeTruthy();
      expect(title, `${route.path}'s raw <title> should differ from the generic root title`).not.toBe(rootTitle);
    }
  });
});
