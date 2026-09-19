import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { Metric, RoundFrame } from "../ws/types";

const FULL_SEASON_GAMES = 38;

interface RmseChartProps {
  metric: Metric;
  roundsSoFar: RoundFrame[];
}

export function RmseChart({ metric, roundsSoFar }: RmseChartProps) {
  const option = useMemo<EChartsOption>(() => {
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
      legend: { top: 0, data: ["Current season", "Last season (prior)"] },
      xAxis: { type: "category", name: "games played", data: games },
      yAxis: { type: "value", name: "RMSE (positions)" },
      series: [
        {
          name: "Current season",
          type: "line",
          data: current,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: "#3b82f6" },
          markLine:
            crossoverGames === null
              ? undefined
              : {
                  symbol: "none",
                  label: { formatter: "⚡ crossover" },
                  lineStyle: { color: "#f59e0b" },
                  data: [{ xAxis: crossoverGames - 1 }],
                },
        },
        {
          name: "Last season (prior)",
          type: "line",
          data: prior,
          showSymbol: false,
          lineStyle: { width: 1, color: "#ef4444", type: "dashed" },
        },
      ],
    };
  }, [metric, roundsSoFar]);

  return <EChart option={option} />;
}
