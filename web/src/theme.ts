import * as echarts from "echarts/core";

/**
 * Reads resolved values rather than duplicating hex literals -- index.css
 * is the single source of truth, this just hands the same values to
 * canvas-rendered ECharts, which can't resolve var() itself.
 */
const root = getComputedStyle(document.documentElement);
const token = (name: string) => root.getPropertyValue(name).trim();

export const colors = {
  bg: token("--bg"),
  panel: token("--panel"),
  border: token("--border"),
  text: token("--text"),
  textSecondary: token("--text-secondary"),
  green: token("--green"),
  red: token("--red"),
  blue: token("--blue"),
  gold: token("--gold"),
  indigo: token("--indigo"),
  orange: token("--orange"),
  cyan: token("--cyan"),
  relegation: token("--relegation"),
};

export const fonts = {
  heading: token("--font-heading"),
  body: token("--font-body"),
  mono: token("--font-mono"),
};

export const ECHARTS_THEME = "pl-crossover";

echarts.registerTheme(ECHARTS_THEME, {
  backgroundColor: "transparent",
  textStyle: { fontFamily: fonts.body, color: colors.text },
  color: [colors.green, colors.red, colors.blue, colors.gold, colors.indigo, colors.orange, colors.cyan],
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
