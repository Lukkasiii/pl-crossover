import { useMemo } from "react";
import type { EChartsOption, LineSeriesOption } from "echarts";
import { EChart } from "./EChart";
import { getColors, getFonts } from "../theme";
import { useLocale } from "../i18n/LocaleContext";

export interface RankSeries {
  /** ranks[i] pairs with categories[i]; null where that subject has no value for that category (e.g. a season it didn't play). */
  ranks: (number | null)[];
  name?: string;
  color?: string;
}

interface RankLineChartProps {
  /** x-axis labels -- season labels for the per-season chart, games played 1..38 for the per-game one. */
  categories: (string | number)[];
  series: RankSeries[];
  xAxisName: string;
}

/**
 * Shared by TeamDetail's two charts (final rank per season, and rank per
 * game within one season) and Compare's team-vs-team overlay -- all three
 * are just "one or more ranks against some shared x-axis", so one component
 * takes whichever series the caller has rather than three near-identical
 * ones. Inverted y-axis: rank 1 (top of the table) draws at the top of the
 * chart, not the bottom -- an un-inverted league position chart is simply
 * wrong (see CLAUDE.md "3c. /teams").
 */
export function RankLineChart({ categories, series, xAxisName }: RankLineChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    const fonts = getFonts();
    const defaultColors = [colors.series5, colors.series1];
    const echartsSeries: LineSeriesOption[] = series.map((s, i) => {
      const color = s.color ?? defaultColors[i % defaultColors.length];
      return {
        name: s.name,
        type: "line",
        data: s.ranks,
        connectNulls: false,
        showSymbol: s.ranks.length <= 8,
        itemStyle: { color },
        lineStyle: { width: 2, color },
      };
    });

    return {
      grid: { left: 48, right: 16, top: series.some((s) => s.name) ? 32 : 24, bottom: 40 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `#${v}` },
      legend: series.some((s) => s.name) ? { top: 0, data: series.map((s) => s.name ?? "") } : undefined,
      xAxis: { type: "category", name: xAxisName, data: categories, axisLabel: { fontFamily: fonts.mono } },
      yAxis: {
        type: "value",
        name: t("teamDetail.chart.rankAxis"),
        nameGap: 28,
        inverse: true,
        min: 1,
        max: 20,
        interval: 1,
        axisTick: { show: false },
        axisLabel: { formatter: (v: number) => String(v), fontFamily: fonts.mono },
      },
      series: echartsSeries,
    };
  }, [categories, series, xAxisName, t]);

  return <EChart option={option} />;
}
