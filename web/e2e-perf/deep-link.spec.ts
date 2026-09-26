import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";

/**
 * Cold load of a shared replay link, /season?week=30: how long until the
 * page shows round 30 -- the table *and* the round history the model panels
 * plot. Two arms, same build, same server:
 *
 * - "walk":    `?seek=walk` (useReplaySocket.ts, dev-only) -- the old path,
 *              one awaited `{"cmd":"seek","seq":i}` per frame up to round 30.
 * - "through": the default -- one `{"cmd":"seek_through","week":30}`,
 *              answered with every frame up to that round in one message.
 *
 * Each run gets a fresh browser context, so nothing (frame cache, JS heap)
 * carries over between runs. Interleaved walk/through/walk/... for the same
 * reason raf-coalescing.spec.ts is: machine drift lands in both arms as
 * noise instead of between them as a fake gap. One unmeasured load of each
 * arm first, so the server's once-per-pair frame build and Vite's first
 * module transform are paid before anything is timed.
 *
 * Timed from navigation start (performance.now() in the page) to the first
 * animation frame where the current-round marker reads 30 and the standings
 * table has rows.
 */

const REPS_PER_MODE = 8;
const WEEK = 30;
type Mode = "walk" | "through";

// Two network conditions, each its own dev server (playwright.perf.config.ts):
// straight to the API on localhost, and through latencyProxy.mjs at a 50ms
// round trip -- what a visitor on the same continent as the server sees.
const NETWORKS = [
  { name: "localhost", origin: "http://localhost:5195" },
  { name: "rtt50ms", origin: "http://localhost:5196" },
] as const;
type Network = (typeof NETWORKS)[number]["name"];

interface RunResult {
  network: Network;
  mode: Mode;
  msToRound: number;
}

async function runOnce(browser: Browser, network: (typeof NETWORKS)[number], mode: Mode): Promise<RunResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = `${network.origin}/season?week=${WEEK}${mode === "walk" ? "&seek=walk" : ""}`;
  await page.goto(url);
  const handle = await page.waitForFunction(
    (week) => {
      const round = document.querySelector('[data-testid="current-round"]');
      const hasRows = document.querySelector("table tbody tr") !== null;
      return round?.getAttribute("data-games") === String(week) && hasRows ? performance.now() : null;
    },
    WEEK,
    { timeout: 120_000, polling: "raf" },
  );
  const msToRound = (await handle.jsonValue()) as number;
  await expect(page.getByTestId("current-round")).toHaveAttribute("data-games", String(WEEK));
  await context.close();
  return { network: network.name, mode, msToRound };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function spread(xs: number[]): number {
  return Math.max(...xs) - Math.min(...xs);
}

test(`cold /season?week=${WEEK}: per-frame walk vs seek_through, interleaved A/B`, async ({ browser }) => {
  test.setTimeout(1_800_000);
  const results: RunResult[] = [];
  for (const network of NETWORKS) {
    await runOnce(browser, network, "walk");
    await runOnce(browser, network, "through");
    for (let i = 0; i < REPS_PER_MODE; i++) {
      results.push(await runOnce(browser, network, "walk"));
      results.push(await runOnce(browser, network, "through"));
    }
  }

  const summarize = (network: Network, mode: Mode) => {
    const xs = results.filter((r) => r.network === network && r.mode === mode).map((r) => r.msToRound);
    return { network, mode, n: xs.length, msToRound: { median: median(xs), spread: spread(xs) } };
  };
  const summary = {
    repsPerMode: REPS_PER_MODE,
    week: WEEK,
    arms: NETWORKS.flatMap((n) => (["walk", "through"] as const).map((m) => summarize(n.name, m))),
    raw: results,
  };

  writeFileSync(path.join(process.cwd(), "e2e-perf", "deep-link-results.json"), JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary.arms, null, 2));
  expect(results).toHaveLength(NETWORKS.length * REPS_PER_MODE * 2);
});
