import { expect, test } from "@playwright/test";

/**
 * Records the README's top-of-page GIF: the replay running and the
 * crossover marker arriving on the RMSE chart (see CLAUDE.md "5. Make it
 * visible in 30 seconds"). Not part of `npm run test:e2e` -- this is a
 * recording, not a check. Run via:
 *
 *   npm run demo:data && npm run build:demo
 *   npx playwright test --config=playwright.gif.config.ts
 *
 * then convert the produced .webm (path printed by Playwright, under
 * test-results/) to a GIF with ffmpeg -- see README.md's "Frontend
 * decisions" for the exact command used.
 *
 * `?week=9` starts a few games before the pooled-xG crossover (~11.8 games,
 * so it lands visibly during round 12) instead of from game 0 -- game 0
 * would spend most of a 15s clip on an uneventful, still-near-empty table
 * with no crossover in frame at all. The metric selector defaults to
 * "points" (crossover ~6.5 games, already passed by week 9), not xG --
 * switched explicitly below so the clip shows the number this project is
 * actually pitched on (CLAUDE.md's "11.8 games, not '≈12'" headline).
 */
test.use({ video: "on", viewport: { width: 1280, height: 900 } });

test("season replay approaching the crossover", async ({ page }) => {
  // No leading slash: baseURL already carries the "/pl-crossover/" base --
  // a leading "/" would resolve against the origin instead and 404 (the
  // same basename gotcha CLAUDE.md's useUrlParamWriter note describes).
  await page.goto("season?week=9");
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("metric-select").click();
  await page.getByRole("option", { name: "xG", exact: true }).click();
  await page.waitForTimeout(500); // let the seek-driven chart/table settle before recording the "interesting" span

  await page.getByTestId("player-toggle").click();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "playing");

  await page.waitForTimeout(15_000); // 1x pacing: enough to carry the replay past round 12 and show the marker land

  await page.getByTestId("player-toggle").click(); // pause cleanly so the last recorded frame isn't mid-transition
});
