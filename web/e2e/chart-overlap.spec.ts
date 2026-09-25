import { expect, test } from "@playwright/test";

/**
 * A canvas chart has no DOM for layout.spec.ts's scrollWidth check to see,
 * so a legend drawn on top of a marker label passes every other test. This
 * reads each chart's rendered text boxes straight out of zrender (via the
 * dev-only `__echart` handle EChart.tsx attaches) and fails if any two
 * intersect -- the ⚡ Crossover label colliding with the legend on
 * /overview is the bug that prompted it. Same widths as layout.spec.ts.
 */
const ROUTES = ["/", "/season", "/model", "/compare", "/teams/arsenal"];
const WIDTHS = [1440, 1024, 900, 390] as const;

interface Box {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function textCollisions(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    type ZrEl = {
      type: string;
      ignore?: boolean;
      invisible?: boolean;
      style?: { text?: string; opacity?: number };
      transform?: number[];
      getBoundingRect: () => { clone: () => { applyTransform: (m?: number[]) => void; x: number; y: number; width: number; height: number } };
    };
    type Chart = { getZr: () => { storage: { getDisplayList: (update: boolean) => ZrEl[] } } };
    const out: string[] = [];
    document.querySelectorAll<HTMLElement & { __echart?: Chart }>("[data-echart]").forEach((node, chartIndex) => {
      const chart = node.__echart;
      if (!chart || node.offsetParent === null) return;
      const boxes: Box[] = [];
      for (const el of chart.getZr().storage.getDisplayList(true)) {
        if (el.type !== "tspan" || el.ignore || el.invisible || (el.style?.opacity ?? 1) === 0) continue;
        const text = el.style?.text ?? "";
        if (!text.trim()) continue;
        const r = el.getBoundingRect().clone();
        r.applyTransform(el.transform);
        boxes.push({ text, x: r.x, y: r.y, w: r.width, h: r.height });
        // Clipped by the canvas edge is the same failure as overlapped:
        // part of the label is gone either way.
        if (r.x < -1 || r.y < -1 || r.x + r.width > node.clientWidth + 1 || r.y + r.height > node.clientHeight + 1) {
          out.push(`chart ${chartIndex} (${node.clientWidth}px): "${text}" is clipped by the canvas edge`);
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          // 1px tolerance: glyph boxes of adjacent axis labels can kiss.
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (overlapX > 1 && overlapY > 1) out.push(
              `chart ${chartIndex} (${node.clientWidth}px): "${a.text}" @${Math.round(a.x)},${Math.round(a.y)} ` +
                `overlaps "${b.text}" @${Math.round(b.x)},${Math.round(b.y)}`,
            );
        }
      }
    });
    return out;
  });
}

test.describe("chart text never overlaps", () => {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        // /season opens at the season's last round so the RMSE curve, and
        // its crossover marker, are fully drawn -- the collision only
        // exists once they are.
        await page.goto(route === "/season" ? "/season?week=38" : route);
        if (route === "/season") {
          // A cold ?week= deep link walks the socket frame by frame up to
          // that round (useReplaySocket.seekToWeek) -- ~380 round trips,
          // which under a full parallel run can take tens of seconds.
          test.slow();
          await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 60_000 });
        } else {
          await page.waitForLoadState("networkidle");
        }
        await expect(page.locator("[data-echart]").first()).toBeVisible();
        // ECharts animates series in; measure the settled frame.
        await page.waitForTimeout(1200);
        expect(await textCollisions(page)).toEqual([]);
      });
    }
  }
});
