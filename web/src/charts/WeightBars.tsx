import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { colors, fonts } from "../theme";

interface WeightBarsProps {
  weights: { prior: number; data: number } | null;
}

/**
 * Callers send raw precision weights (w_prior fixed at 5 by default, w_data
 * growing with games played), not shares -- normalize here so the bars read
 * as the 60% -> 27% prior share the study reports. Used only by the tunable
 * prediction panel (weights off a POST /api/predict response) -- a second
 * copy driven straight off the replay's round frame used to sit above it,
 * identical at the slider's default, so it was folded into this one.
 */
export function WeightBars({ weights }: WeightBarsProps) {
  const option = useMemo<EChartsOption>(() => {
    const w = weights;
    const total = w ? w.prior + w.data : 1;
    const priorShare = w ? w.prior / total : 1;
    const dataShare = w ? w.data / total : 0;

    return {
      grid: { left: 8, right: 8, top: 24, bottom: 24 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${((v as number) * 100).toFixed(0)}%` },
      xAxis: { type: "value", max: 1, show: false },
      yAxis: { type: "category", data: ["weight"], show: false },
      series: [
        {
          name: "Last season (prior)",
          type: "bar",
          stack: "weight",
          data: [priorShare],
          itemStyle: { color: colors.red },
          label: {
            show: true,
            formatter: () => `${(priorShare * 100).toFixed(0)}%`,
            position: "insideLeft",
            fontFamily: fonts.mono,
          },
        },
        {
          name: "Current season (data)",
          type: "bar",
          stack: "weight",
          data: [dataShare],
          itemStyle: { color: colors.blue },
          label: {
            show: true,
            formatter: () => `${(dataShare * 100).toFixed(0)}%`,
            position: "insideRight",
            fontFamily: fonts.mono,
          },
        },
      ],
    };
  }, [weights]);

  return <EChart option={option} />;
}
