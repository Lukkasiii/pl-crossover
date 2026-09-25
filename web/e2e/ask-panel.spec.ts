import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Exercises the whole cached agent path end to end: pick a preset question,
 * the tool-call chips it used render, the answer actually streams in (not
 * just appears fully formed), a chip click highlights the panel it relates
 * to, stop halts the reveal, and "ask another question" gets back to the
 * preset list. See CLAUDE.md "Feature 3" -- there is no live model behind
 * this, but the tool-calling path and the streaming reveal are real.
 */
test.describe("Ask the Model", () => {
  test("asking a preset question streams the answer and renders its tool calls", async ({ page }) => {
    await page.goto("/model");
    await expect(page.getByTestId("ask-panel")).toBeVisible();

    await page.getByTestId("ask-preset-crossover-round-12").click();
    await expect(page.getByTestId("ask-question")).toHaveText("Why did predictions get more accurate after round 12?");

    const chips = page.getByTestId("ask-tool-call-chip");
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText("get_rmse_curve(metric=xg)");
    await expect(chips.first()).toContainText("crossover ≈ 11.84 games");

    // Proves this is a genuine reveal, not the full string dropped in at
    // once: caught mid-stream, the visible answer is a non-empty strict
    // prefix of the final one -- then it keeps growing until done.
    const answer = page.getByTestId("ask-answer");
    await expect(answer).not.toHaveText("", { timeout: 5000 });
    const partial = await answer.innerText();
    await expect
      .poll(async () => (await answer.innerText()).length, { timeout: 5000 })
      .toBeGreaterThan(partial.length);

    // ~500 chars at 2/frame, gated to a real ~60fps pace (see
    // MIN_FRAME_INTERVAL_MS in useStreamingText.ts) takes a few real
    // seconds -- this is the actual reveal duration, not test slack.
    await expect(page.getByTestId("ask-stop")).toBeHidden({ timeout: 10000 });
    const finalText = await answer.innerText();
    expect(finalText.startsWith(partial)).toBe(true);
    expect(finalText.length).toBeGreaterThan(partial.length);
  });

  test("a stop click freezes the reveal", async ({ page }) => {
    await page.goto("/model");
    await expect(page.getByTestId("ask-panel")).toBeVisible();

    await page.getByTestId("ask-preset-sigma-prior-10").click();
    await expect(page.getByTestId("ask-stop")).toBeVisible();
    await page.getByTestId("ask-stop").click();

    const frozen = await page.getByTestId("ask-answer").innerText();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("ask-answer")).toHaveText(frozen);
    await expect(page.getByTestId("ask-stop")).toBeHidden();
  });

  test("a tool-call chip highlights the panel it relates to", async ({ page }) => {
    await page.goto("/model");
    await expect(page.getByTestId("ask-panel")).toBeVisible();

    await page.getByTestId("ask-preset-crossover-round-12").click();
    const chip = page.getByTestId("ask-tool-call-chip").first();
    await chip.waitFor();

    const rmsePanel = page.locator("h2", { hasText: "Current RMSE by metric" }).locator("xpath=ancestor::section");
    await expect(rmsePanel).not.toHaveClass(/panel-highlighted/);
    await chip.click();
    await expect(rmsePanel).toHaveClass(/panel-highlighted/);
  });

  test("ask another question returns to the preset list", async ({ page }) => {
    await page.goto("/model");
    await expect(page.getByTestId("ask-panel")).toBeVisible();

    await page.getByTestId("ask-preset-fastest-metric").click();
    await expect(page.getByTestId("ask-answer")).toBeVisible();
    await page.getByTestId("ask-another").click();

    await expect(page.getByTestId("ask-preset-crossover-round-12")).toBeVisible();
    await expect(page.getByTestId("ask-answer")).toHaveCount(0);
  });

  test("/model with an answered question has no axe violations", async ({ page }) => {
    await page.goto("/model");
    await expect(page.getByTestId("ask-panel")).toBeVisible();
    await page.getByTestId("ask-preset-prior-share-by-checkpoint").click();
    await expect(page.getByTestId("ask-stop")).toBeHidden({ timeout: 5000 });

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
