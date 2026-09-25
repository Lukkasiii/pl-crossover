import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { getColors, getFonts } from "../theme";
import { useLocale } from "../i18n/LocaleContext";
import type { Metric, RoundFrame } from "../ws/types";

const FULL_SEASON_GAMES = 38;

interface RmseChartProps {
  metric: Metric;
  roundsSoFar: RoundFrame[];
}

export function RmseChart({ metric, roundsSoFar }: RmseChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    const fonts = getFonts();
    const games = Array.from({ length: FULL_SEASON_GAMES }, (_, i) => i + 1);
    const current: (number | null)[] = games.map(() => null);
    let priorRmse: number | null = null;
    let crossoverGames: number | null = null;

    for (const round of roundsSoFar) {
      const m = round.metrics[metric];
      current[round.games - 1] = m.rmse;
      priorRmse = m.prior_rmse;
      if (crossoverGames === null && m.crossover_passed) crossoverGames = round.games;
    }

    const prior = priorRmse === null ? [] : games.map(() => priorRmse);

    return {
      // The band above the grid belongs to the crossover marker's label
      // alone (ECharts draws it just above the markLine's top end). The
      // legend is HTML above the canvas instead of an ECharts legend: in the
      // 251px-wide /season panel at 1024px the canvas legend wrapped to two
      // rows and landed on the label, and no fixed top padding survives a
      // legend whose row count depends on width and locale. The y-axis name
      // sits on the side (nameLocation "middle") for the same reason.
      // e2e/chart-overlap.spec.ts measures this at every layout-spec width.
      grid: { left: 60, right: 16, top: 28, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (v) => (v as number).toFixed(2) },
      xAxis: { type: "category", name: t("chart.gamesPlayed"), data: games, axisLabel: { fontFamily: fonts.mono } },
      yAxis: {
        type: "value",
        name: t("chart.rmsePositions"),
        nameLocation: "middle",
        nameGap: 44,
        // A "value" axis anchors at zero unless told not to -- zero is not a
        // meaningful RMSE here (nothing is ever near it, and there is no
        // part-of-a-whole reading a zero baseline would protect), so without
        // this every real value gets squashed into the top third of the
        // chart and the crossover reads as a shallow crossing instead of the
        // event it is.
        scale: true,
        axisLabel: { formatter: (v: number) => v.toFixed(2) },
      },
      series: [
        {
          name: t("chart.currentSeason"),
          type: "line",
          data: current,
          showSymbol: false,
          connectNulls: false,
          // itemStyle, not just lineStyle -- the legend's swatch icon draws
          // from itemStyle.color, and without it falls back to the theme's
          // default series-colour cycle instead of matching this line.
          itemStyle: { color: colors.green },
          lineStyle: { width: 2, color: colors.green },
          markLine:
            crossoverGames === null
              ? undefined
              : {
                  silent: false,
                  symbol: ["none", "circle"],
                  symbolSize: 9,
                  lineStyle: { color: colors.gold, width: 2 },
                  // 14px bold is the smallest size that counts as "large
                  // text" under WCAG (>= 3:1, not 4.5:1) -- --gold clears
                  // 3:1 on white but not 4.5:1, so this can't render smaller.
                  label: {
                    formatter: t("chart.crossoverMarker"),
                    fontWeight: "bold",
                    fontSize: 14,
                    color: colors.gold,
                  },
                  emphasis: { lineStyle: { width: 3 } },
                  tooltip: { show: true, trigger: "item", formatter: () => t("player.crossoverHint") },
                  data: [{ xAxis: crossoverGames - 1 }],
                },
        },
        {
          name: t("chart.priorSeason"),
          type: "line",
          data: prior,
          showSymbol: false,
          itemStyle: { color: colors.red },
          lineStyle: { width: 1, color: colors.red, type: "dashed" },
        },
      ],
    };
  }, [metric, roundsSoFar, t]);

  const colors = getColors();
  return (
    <div className="chart-with-legend">
      <ul className="chart-legend">
        <li>
          <span className="chart-legend-swatch" style={{ borderTopColor: colors.green }} aria-hidden="true" />
          {t("chart.currentSeason")}
        </li>
        <li>
          <span className="chart-legend-swatch dashed" style={{ borderTopColor: colors.red }} aria-hidden="true" />
          {t("chart.priorSeason")}
        </li>
      </ul>
      <div className="chart-canvas">
        <EChart option={option} />
      </div>
    </div>
  );
}
