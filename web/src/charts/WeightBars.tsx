import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { colors, fonts } from "../theme";
import type { RoundFrame } from "../ws/types";

interface WeightBarsProps {
  latestRound: RoundFrame | null;
}

/**
 * The socket sends raw precision weights (w_prior fixed at 5, w_data growing
 * with games played), not shares -- normalize here so the bars read as the
 * 60% -> 27% prior share the study reports.
 */
export function WeightBars({ latestRound }: WeightBarsProps) {
  const option = useMemo<EChartsOption>(() => {
    const w = latestRound?.weights;
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
  }, [latestRound]);

  return <EChart option={option} />;
}
