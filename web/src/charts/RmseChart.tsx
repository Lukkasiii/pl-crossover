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
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: [t("chart.currentSeason"), t("chart.priorSeason")] },
      xAxis: { type: "category", name: t("chart.gamesPlayed"), data: games, axisLabel: { fontFamily: fonts.mono } },
      yAxis: { type: "value", name: t("chart.rmsePositions") },
      series: [
        {
          name: t("chart.currentSeason"),
          type: "line",
          data: current,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: colors.green },
          markLine:
            crossoverGames === null
              ? undefined
              : {
                  symbol: "none",
                  label: { formatter: t("chart.crossoverMarker") },
                  lineStyle: { color: colors.gold },
                  data: [{ xAxis: crossoverGames - 1 }],
                },
        },
        {
          name: t("chart.priorSeason"),
          type: "line",
          data: prior,
          showSymbol: false,
          lineStyle: { width: 1, color: colors.red, type: "dashed" },
        },
      ],
    };
  }, [metric, roundsSoFar, t]);

  return <EChart option={option} />;
}
