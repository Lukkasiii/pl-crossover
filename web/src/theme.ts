import * as echarts from "echarts/core";

export interface ColorTokens {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textSecondary: string;
  green: string;
  red: string;
  blue: string;
  gold: string;
  indigo: string;
  orange: string;
  cyan: string;
  relegation: string;
  series1: string;
  series2: string;
  series3: string;
  series4: string;
  series5: string;
}

export interface FontTokens {
  heading: string;
  body: string;
  mono: string;
}

const COLOR_TOKEN_NAMES: Record<keyof ColorTokens, string> = {
  bg: "--bg",
  panel: "--panel",
  border: "--border",
  text: "--text",
  textSecondary: "--text-secondary",
  green: "--green",
  red: "--red",
  blue: "--blue",
  gold: "--gold",
  indigo: "--indigo",
  orange: "--orange",
  cyan: "--cyan",
  relegation: "--relegation",
  series1: "--series-1",
  series2: "--series-2",
  series3: "--series-3",
  series4: "--series-4",
  series5: "--series-5",
};

const FONT_TOKEN_NAMES: Record<keyof FontTokens, string> = {
  heading: "--font-heading",
  body: "--font-body",
  mono: "--font-mono",
};

type PropertySource = Pick<CSSStyleDeclaration, "getPropertyValue">;

function readTokens<T extends Record<string, string>>(root: PropertySource, names: T): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string };
  for (const key in names) out[key] = root.getPropertyValue(names[key]).trim();
  return out;
}

/**
 * Resolved fresh on every call rather than once at module load. index.css
 * is the single source of truth for these values; canvas-rendered ECharts
 * can't read var() itself, so this hands it the same colours -- but reading
 * them once at import time (the previous shape of this module) froze every
 * token as "" whenever Safari's <link rel=stylesheet> hadn't finished
 * applying by the time this module first evaluated, and every chart stayed
 * grey until a full reload. The `root` parameter defaults to the real
 * document but takes an injected stand-in in tests, so the resolution logic
 * is verifiable without a DOM.
 */
export function getColors(root: PropertySource = getComputedStyle(document.documentElement)): ColorTokens {
  return readTokens(root, COLOR_TOKEN_NAMES);
}

export function getFonts(root: PropertySource = getComputedStyle(document.documentElement)): FontTokens {
  return readTokens(root, FONT_TOKEN_NAMES);
}

export const ECHARTS_THEME = "pl-crossover";

/**
 * Registers (or re-registers) the ECharts theme from the tokens as they
 * resolve right now. Call this immediately before echarts.init() -- by
 * then the component has actually mounted, which is later than this
 * module's own evaluation and long enough after the stylesheet was
 * requested that the timing gap observed on Safari hasn't reproduced here.
 * Re-registering under the same name is a plain overwrite, so calling this
 * once per chart mount is cheap and harmless.
 */
export function registerEchartsTheme(): void {
  const colors = getColors();
  const fonts = getFonts();

  echarts.registerTheme(ECHARTS_THEME, {
    backgroundColor: "transparent",
    textStyle: { fontFamily: fonts.body, color: colors.text },
    // The validated chart-series set, in its fixed order (see index.css's
    // --series-* tokens) -- every chart in this app assigns its own colours
    // explicitly (season/model semantics), so this is only the fallback for
    // a series that doesn't.
    color: [colors.series1, colors.series2, colors.series3, colors.series4, colors.series5],
    categoryAxis: {
      axisLine: { lineStyle: { color: colors.border } },
      axisLabel: { color: colors.textSecondary },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisLabel: { color: colors.textSecondary, fontFamily: fonts.mono },
      splitLine: { lineStyle: { color: colors.border } },
    },
    legend: { textStyle: { color: colors.textSecondary } },
    tooltip: {
      backgroundColor: colors.panel,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontFamily: fonts.mono },
    },
  });
}
