import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Measures what the rAF coalescing in useReplaySocket.ts (see its own
 * comment, and CLAUDE.md's "Frontend depth" section 1) actually buys at
 * 50x -- the load it exists to absorb. Not part of `npm run test:e2e` (see
 * playwright.perf.config.ts): this is a timing measurement, not a
 * correctness check, and CI's shared, noisy CPU would make its numbers
 * meaningless.
 *
 * `?coalesce=off` (useReplaySocket.ts, dev-only) commits `viewSeq` to React
 * state on every WS message instead of batching to one commit per animation
 * frame. Comparing the two isolates the thing the pitch is about: "decouple
 * the data arrival rate from the render rate."
 *
 * The primary metric is DOM commits to the standings table body, counted
 * with a MutationObserver, not a requestAnimationFrame tick count. rAF
 * ticks were tried first and rejected: headless Chromium's synthetic
 * BeginFrame source doesn't run rAF at a real vsync cadence, so both modes
 * came back at ~8 ticks/sec regardless of actual main-thread work --
 * meaningless for a relative comparison. A MutationObserver counts what the
 * pitch is actually about (how many times the table's DOM was rewritten,
 * decoupled or not from message arrival) and needs no compositor to do it,
 * so it works the same headless or headed. Long Tasks (>50ms of blocked
 * main thread) is the second, corroborating metric -- also
 * compositor-independent.
 *
 * Interleaved A, B, A, B, ... rather than block-measured (all of A, then
 * all of B) -- CLAUDE.md's build history already has one measurement that
 * used a block design and got a 9-point gap that was actually machine
 * drift, not a real effect. Interleaving means drift shows up as noise
 * inside both groups equally, not as a fake gap between them.
 *
 * Run: npx playwright test --config=playwright.perf.config.ts
 * Writes e2e-perf/raf-coalescing-results.json and prints a summary table.
 */

const REPS_PER_MODE = 8;
const FINISH_TIMEOUT_MS = 15_000;

type Mode = "coalesced" | "bypassed";

interface RunResult {
  mode: Mode;
  durationMs: number;
  domCommits: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  messagesProcessed: number;
}

async function runOnce(page: import("@playwright/test").Page, mode: Mode): Promise<RunResult> {
  const url = mode === "bypassed" ? "/season?coalesce=off" : "/season";
  await page.goto(url);
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("player-toggle").click();
  await expect(page.getByTestId("player-toggle")).toHaveAttribute("data-state", "playing", { timeout: 10_000 });
  await expect(page.getByTitle("open")).toBeVisible({ timeout: 10_000 });

  // Speed only takes effect while already playing -- see replay-resilience.spec.ts.
  await page.getByTestId("speed-select").click();
  await page.getByRole("option", { name: "50x" }).click();

  const { startSeq, totalFrames } = await page.evaluate(() => {
    const w = window as unknown as {
      __perf?: { domCommits: number; longTasks: number[] };
      __mo?: MutationObserver;
      __po?: PerformanceObserver;
      __t0?: number;
    };
    w.__perf = { domCommits: 0, longTasks: [] };

    const tbody = document.querySelector("table tbody")!;
    w.__mo = new MutationObserver(() => {
      w.__perf!.domCommits++;
    });
    w.__mo.observe(tbody, { childList: true, subtree: true, characterData: true, attributes: true });

    w.__po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__perf!.longTasks.push(e.duration);
    });
    w.__po.observe({ entryTypes: ["longtask"] });

    w.__t0 = performance.now();
    const el = document.querySelector('[data-testid="frame-counter"]')!;
    return {
      startSeq: Number(el.getAttribute("data-seq")),
      totalFrames: Number(el.getAttribute("data-total")),
    };
  });

  await expect
    .poll(
      async () => {
        const seq = await page.getAttribute('[data-testid="frame-counter"]', "data-seq");
        return Number(seq);
      },
      { timeout: FINISH_TIMEOUT_MS, intervals: [20] },
    )
    .toBeGreaterThanOrEqual(totalFrames - 1);

  const { t1, domCommits, longTasks, endSeq } = await page.evaluate(() => {
    const w = window as unknown as {
      __perf: { domCommits: number; longTasks: number[] };
      __mo: MutationObserver;
      __po: PerformanceObserver;
    };
    // Flush any pending mutation records before reading the final count.
    w.__perf.domCommits += w.__mo.takeRecords().length > 0 ? 1 : 0;
    w.__mo.disconnect();
    w.__po.disconnect();
    const el = document.querySelector('[data-testid="frame-counter"]')!;
    return {
      t1: performance.now(),
      domCommits: w.__perf.domCommits,
      longTasks: w.__perf.longTasks,
      endSeq: Number(el.getAttribute("data-seq")),
    };
  });

  const t0 = await page.evaluate(() => (window as unknown as { __t0: number }).__t0);
  await page.getByTestId("player-toggle").click(); // pause, so the next goto() isn't racing a still-playing stream

  return {
    mode,
    durationMs: t1 - t0,
    domCommits,
    longTaskCount: longTasks.length,
    longTaskTotalMs: longTasks.reduce((a, b) => a + b, 0),
    messagesProcessed: endSeq - startSeq,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function spread(xs: number[]): number {
  return Math.max(...xs) - Math.min(...xs);
}

function summarize(mode: Mode, rs: RunResult[]) {
  return {
    mode,
    n: rs.length,
    durationMs: { median: median(rs.map((r) => r.durationMs)), spread: spread(rs.map((r) => r.durationMs)) },
    domCommits: { median: median(rs.map((r) => r.domCommits)), spread: spread(rs.map((r) => r.domCommits)) },
    longTaskCount: { median: median(rs.map((r) => r.longTaskCount)), spread: spread(rs.map((r) => r.longTaskCount)) },
    longTaskTotalMs: { median: median(rs.map((r) => r.longTaskTotalMs)), spread: spread(rs.map((r) => r.longTaskTotalMs)) },
    messagesProcessed: { median: median(rs.map((r) => r.messagesProcessed)), spread: spread(rs.map((r) => r.messagesProcessed)) },
  };
}

test("rAF coalescing vs bypass at 50x, interleaved A/B", async ({ page }) => {
  test.setTimeout(360_000);
  const results: RunResult[] = [];

  for (let i = 0; i < REPS_PER_MODE; i++) {
    results.push(await runOnce(page, "coalesced"));
    results.push(await runOnce(page, "bypassed"));
  }

  const coalesced = results.filter((r) => r.mode === "coalesced");
  const bypassed = results.filter((r) => r.mode === "bypassed");
  const summary = {
    repsPerMode: REPS_PER_MODE,
    coalesced: summarize("coalesced", coalesced),
    bypassed: summarize("bypassed", bypassed),
    raw: results,
  };

  const outPath = path.join(process.cwd(), "e2e-perf", "raf-coalescing-results.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  expect(coalesced.length).toBe(REPS_PER_MODE);
  expect(bypassed.length).toBe(REPS_PER_MODE);
});
