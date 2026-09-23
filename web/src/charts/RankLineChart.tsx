import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { getColors, getFonts } from "../theme";
import { useLocale } from "../i18n/LocaleContext";

interface RankLineChartProps {
  /** x-axis labels -- season labels for the per-season chart, games played 1..38 for the per-game one. */
  categories: (string | number)[];
  /** live_rank/final_rank per category, same length and order as categories. */
  ranks: number[];
  xAxisName: string;
}

/**
 * Shared by TeamDetail's two charts (final rank per season, and rank per
 * game within one season) -- both are just "rank against some x-axis",
 * so one component takes whichever categories the caller has rather than
 * two near-identical ones. Inverted y-axis: rank 1 (top of the table)
 * draws at the top of the chart, not the bottom -- an un-inverted league
 * position chart is simply wrong (see CLAUDE.md "3c. /teams").
 */
export function RankLineChart({ categories, ranks, xAxisName }: RankLineChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    const fonts = getFonts();
    return {
      grid: { left: 48, right: 16, top: 24, bottom: 40 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `#${v}` },
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
      series: [
        {
          type: "line",
          data: ranks,
          showSymbol: ranks.length <= 8,
          itemStyle: { color: colors.blue },
          lineStyle: { width: 2, color: colors.blue },
        },
      ],
    };
  }, [categories, ranks, xAxisName, t]);

  return <EChart option={option} />;
}
