import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { METRICS, type RoundFrame } from "../ws/types";

const LABELS: Record<string, string> = { xg: "xG", xgd: "xGD", gd: "GD", points: "Points" };

interface MetricsBarChartProps {
  latestRound: RoundFrame | null;
}

export function MetricsBarChart({ latestRound }: MetricsBarChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: METRICS.map((m) => LABELS[m]) },
      yAxis: { type: "value", name: "current RMSE" },
      series: [
        {
          name: "Current-season RMSE",
          type: "bar",
          data: METRICS.map((m) => latestRound?.metrics[m]?.rmse ?? 0),
          itemStyle: { color: "#3b82f6" },
        },
      ],
    }),
    [latestRound],
  );

  return <EChart option={option} />;
}
