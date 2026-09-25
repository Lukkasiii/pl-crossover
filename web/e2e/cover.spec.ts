import { expect, test, type Page } from "@playwright/test";

async function openCover(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("page-cover")).toBeVisible();
}

test.describe("cover", () => {
  test("the Enter-the-dashboard button enters Overview", async ({ page }) => {
    await openCover(page);
    await page.getByTestId("cover-enter").click();
    await expect(page.getByTestId("page-overview")).toBeVisible();
    await expect(page).toHaveURL(/\/overview$/);
  });

  test("scrolling down enters Overview", async ({ page }) => {
    await openCover(page);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 200);
    await expect(page.getByTestId("page-overview")).toBeVisible();
  });

  for (const key of ["Enter", "Space"]) {
    test(`${key} enters Overview`, async ({ page }) => {
      await openCover(page);
      await page.keyboard.press(key);
      await expect(page.getByTestId("page-overview")).toBeVisible();
    });
  }

  test("?lang= survives entering", async ({ page }) => {
    await page.goto("/?lang=zh");
    await page.getByTestId("cover-enter").click();
    await expect(page.getByTestId("page-overview")).toBeVisible();
    await expect(page).toHaveURL(/\/overview\?lang=zh$/);
  });

  test("pulling up at the top of Overview brings the cover back", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByTestId("page-overview")).toBeVisible();
    await page.mouse.move(700, 400);
    // The hook only counts a pull once the page has sat at the top for a
    // moment -- the tail of a scroll that just arrived there doesn't count.
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -300);
    await expect(page.getByTestId("page-cover")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("scrolling up inside Overview, below the top, stays on Overview", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto("/overview");
    await expect(page.getByTestId("page-overview")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-overview")).toBeVisible();
  });

  test("a direct hit on /overview renders Overview, not the cover", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByTestId("page-overview")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("page-cover")).toHaveCount(0);
  });

  test("prefers-reduced-motion stops the animation outright", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCover(page);
    const curve = page.getByTestId("cover-curve");
    await expect(curve).toBeVisible();
    const animations = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest('[data-testid="page-cover"]') !== null;
      }).length,
    );
    expect(animations).toBe(0);
    // Not slowed down to invisibility: the finished frame is drawn.
    const dashOffset = await curve.locator("path").evaluate((el) => getComputedStyle(el).strokeDashoffset);
    expect(parseFloat(dashOffset)).toBe(0);
  });
});
