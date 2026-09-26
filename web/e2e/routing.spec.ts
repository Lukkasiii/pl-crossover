import { expect, test } from "@playwright/test";

const ROUTES = [
  { nav: "nav-overview", page: "page-overview", path: "/overview" },
  { nav: "nav-season", page: "page-season", path: "/season" },
  { nav: "nav-model", page: "page-model", path: "/model" },
  { nav: "nav-teams", page: "page-teams", path: "/teams" },
  { nav: "nav-compare", page: "page-compare", path: "/compare" },
  { nav: "nav-method", page: "page-method", path: "/method" },
  { nav: "nav-scenarios", page: "page-scenarios", path: "/scenarios" },
];

test.describe("sidebar navigation", () => {
  test("every route is reachable from the sidebar by mouse", async ({ page }) => {
    await page.goto("/overview");
    for (const route of ROUTES) {
      await page.getByTestId(route.nav).click();
      await expect(page.getByTestId(route.page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route.path);
    }
  });

  // Walks the real Tab order from the top of the document rather than
  // calling .focus() on each link directly -- that would prove the element
  // is focusable, not that a keyboard-only user actually lands on it in
  // sequence. Caps at 40 tabs so a broken tab trap fails the test instead
  // of hanging it.
  test("every route is reachable from the sidebar by keyboard", async ({ page }) => {
    await page.goto("/overview");
    // Under parallel load the JS bundle can still be hydrating when the
    // first Tab fires -- wait for the nav to actually be there so this
    // tests the real tab order, not a race with hydration.
    await expect(page.getByTestId("sidebar-nav")).toBeVisible();
    const seen = new Set<string>();
    const wanted = new Set(ROUTES.map((r) => r.nav));

    for (let i = 0; i < 40 && seen.size < wanted.size; i++) {
      await page.keyboard.press("Tab");
      const testid = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
      if (testid && wanted.has(testid)) seen.add(testid);
    }

    expect([...seen].sort()).toEqual([...wanted].sort());

    // Activating one by keyboard actually navigates, not just focuses.
    await page.getByTestId("nav-scenarios").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("page-scenarios")).toBeVisible();
  });

  test("/teams/:slug renders that team's own page", async ({ page }) => {
    await page.goto("/teams/arsenal");
    await expect(page.getByTestId("page-team-detail")).toContainText("Arsenal");
  });

  test("/teams/:slug for an unknown slug renders a real not-found state, not a blank page", async ({ page }) => {
    await page.goto("/teams/no-such-team");
    await expect(page.getByTestId("page-team-detail-not-found")).toBeVisible();
    await page.getByTestId("team-not-found-back-link").click();
    await expect(page.getByTestId("page-teams")).toBeVisible();
  });
});

test("a ?week= link lands on that round", async ({ page }) => {
  await page.goto("/season?week=20");
  await expect(page.getByTestId("current-round")).toHaveAttribute("data-games", "20");
  // The URL keeps carrying the week it landed on, not just the one it
  // started from -- useUrlWeekSync writes back through useSearchParams.
  await expect(page).toHaveURL(/week=20/);
});
