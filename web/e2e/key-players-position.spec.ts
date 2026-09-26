import { expect, test } from "@playwright/test";

/**
 * One position per player-season in the Key players table: the most
 * advanced of the codes Understat lists, with S dropped entirely, and an
 * em-dash where Understat records no position (a code of just "S").
 */
const ROLE = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const MOST_ADVANCED: [string, string][] = [
  ["F", "Forward"],
  ["M", "Midfielder"],
  ["D", "Defender"],
  ["GK", "Goalkeeper"],
];

test("the Position column shows exactly one role, or an em-dash when none is recorded", async ({ page }) => {
  await page.goto("/teams/arsenal");
  const cells = page.locator("[data-position-code]");
  await expect(cells.first()).toBeVisible();

  const rendered = await cells.evaluateAll((tds) =>
    tds.map((td) => ({
      code: td.getAttribute("data-position-code") ?? "",
      shown: Array.from(td.childNodes)
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains("visually-hidden")))
        .map((n) => n.textContent ?? "")
        .join("")
        .trim(),
    })),
  );
  expect(rendered.length).toBeGreaterThan(0);

  for (const { code, shown } of rendered) {
    const letters = code.split(/\s+/);
    const expected = MOST_ADVANCED.find(([letter]) => letters.includes(letter))?.[1] ?? "—";
    expect(shown, `code "${code}"`).toBe(expected);
    expect(shown).not.toMatch(/sub|substitute/i);
    if (expected !== "—") expect(ROLE).toContain(shown);
  }

  // The default season (2024/25) has Arsenal players coded only "S" -- the
  // em-dash case -- so it can be checked without switching seasons.
  const sOnly = page.locator('[data-position-code="S"]').first();
  await expect(sOnly).toBeVisible();
  await expect(sOnly.locator('[aria-hidden="true"]')).toHaveText("—");
  await expect(sOnly.locator(".visually-hidden")).toHaveText("No position recorded");
});
