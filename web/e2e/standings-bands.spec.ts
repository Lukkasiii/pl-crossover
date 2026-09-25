import { expect, test } from "@playwright/test";

/**
 * The zone bands belong to places, not teams: while rows reorder, the
 * tinted stripes behind them must not move at all. Samples the stripes'
 * on-screen boxes before and *during* a run of reorders (FLIP is mid-slide
 * for the whole sampling window) and requires them identical.
 */
test("zone bands stay put while the standings reorder", async ({ page }) => {
  test.slow();
  // Stepped forward frame by frame rather than a ?week= deep link: that
  // path walks ~50 seeks before rendering and was flaky under a full
  // parallel run. Stripes only cover ranked slots, so all nine banded
  // stripes appear once every club has played.
  await page.goto("/season");
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
  const banded = page.locator('[data-testid="standings-backdrop"] > [data-band]');
  for (let i = 0; i < 40 && (await banded.count()) < 9; i++) {
    const before = await page.getByTestId("frame-counter").getAttribute("data-seq");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-counter")).not.toHaveAttribute("data-seq", before ?? "");
  }

  const stripeBoxes = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="standings-backdrop"] > [data-band]')).map((el) => {
        const r = el.getBoundingClientRect();
        return [el.getAttribute("data-band"), Math.round(r.top), Math.round(r.height)];
      }),
    );
  const order = () => page.locator("table tbody tr").evaluateAll((rows) => rows.map((r) => r.getAttribute("aria-label")));

  const before = await stripeBoxes();
  expect(before.map((b) => b[0])).toEqual(["cl", "cl", "cl", "cl", "el", "ecl", "rel", "rel", "rel"]);

  // Rows are transparent over the backdrop, not carrying their own tint.
  const rowBg = await page.locator("table tbody tr").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(rowBg).toBe("rgba(0, 0, 0, 0)");

  const orderBefore = await order();
  const samples: unknown[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("ArrowRight");
    samples.push(await stripeBoxes());
  }
  expect(await order()).not.toEqual(orderBefore); // something actually reordered
  for (const s of samples) expect(s).toEqual(before);
});
