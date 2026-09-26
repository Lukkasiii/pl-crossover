import { expect, test, type Page } from "@playwright/test";

/**
 * /season opens before a ball is kicked: the timeline at the far left, all
 * 20 clubs at zero with no ranks and no zone bands, and Play brings on
 * match 1. Position 0 is a view state, not a frame -- the stream still has
 * 418, with seq 0 = "match 1 played".
 */
async function expectPreKickoff(page: Page) {
  await expect(page.getByTestId("frame-counter")).toHaveAttribute("data-seq", "-1");
  await expect(page.getByTestId("replay-timeline")).toHaveAttribute("aria-valuenow", "0");
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(20);
  // Rank cell reads "-", games played and points read 0, for every club.
  // Polled: points tween to their new value rather than jumping.
  await expect
    .poll(() =>
      rows.evaluateAll((trs) =>
        trs.every((tr) => {
          const tds = tr.querySelectorAll("td");
          return tds[0].textContent?.trim() === "-" && tds[2].textContent?.trim() === "0" && tds[7].textContent?.trim() === "0";
        }),
      ),
    )
    .toBe(true);
  // Nobody has earned a place yet, so no zone band is painted.
  await expect(page.locator('[data-testid="standings-backdrop"] > [data-band]')).toHaveCount(0);
  // No round has been played, so there's no round badge and no ?week=.
  await expect(page.getByTestId("current-round")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("week")).toBeNull();
}

test("/season opens before kickoff, and Play starts from match 1", async ({ page }) => {
  await page.goto("/season");
  await expectPreKickoff(page);
  await expect(page.getByTestId("frame-counter")).toHaveAttribute("data-total", "418");

  // The first position shown after Play must be frame 0 -- match 1 -- not a
  // skip past it. Recorded by an observer set up before the click, not
  // polled afterwards: at 1x frame 0 is on screen for ~200ms, which a
  // retrying assertion under a loaded parallel run can simply miss.
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="frame-counter"]')!;
    const w = window as unknown as { __firstSeq?: string };
    new MutationObserver((_, obs) => {
      const seq = el.getAttribute("data-seq");
      if (seq !== "-1") {
        w.__firstSeq = seq ?? undefined;
        obs.disconnect();
      }
    }).observe(el, { attributes: true, attributeFilter: ["data-seq"] });
  });
  await page.getByTestId("player-toggle").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __firstSeq?: string }).__firstSeq))
    .toBe("0");
  await page.getByTestId("player-toggle").click();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "paused");
});

test("dragging the timeline to the far left returns to before kickoff, and right re-enters the stream", async ({ page }) => {
  await page.goto("/season?week=3");
  await expect(page.getByTestId("current-round")).toHaveAttribute("data-games", "3");

  const slider = page.getByTestId("replay-timeline");
  await slider.focus();
  await slider.press("Home");
  await expectPreKickoff(page);

  await slider.press("ArrowRight");
  await expect(page.getByTestId("frame-counter")).toHaveAttribute("data-seq", "0");
  await expect(page.locator("table tbody tr td").first()).not.toHaveText("-");
});

test("a ?week= link still lands where it says, not at kickoff", async ({ page }) => {
  await page.goto("/season?week=12");
  await expect(page.getByTestId("current-round")).toHaveAttribute("data-games", "12");
  await expect(page).toHaveURL(/week=12/);
});
