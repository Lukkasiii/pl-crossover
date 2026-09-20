import { expect, test } from "@playwright/test";

/**
 * fr tracks default to min-width: auto, so a wide table or chart can hold
 * a grid track open past its fr share and push the page wider than the
 * viewport -- a screenshot doesn't show this, only measuring scrollWidth
 * against innerWidth does.
 */
test.describe("layout", () => {
  test("no horizontal overflow at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /play/i }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.getByRole("button", { name: /pause/i }).click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("no horizontal overflow at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: /play/i }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.getByRole("button", { name: /pause/i }).click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
