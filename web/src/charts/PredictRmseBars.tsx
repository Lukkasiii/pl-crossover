import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { colors } from "../theme";
import type { PredictOut } from "../api/usePredict";

interface PredictRmseBarsProps {
  predict: PredictOut | undefined;
  className?: string;
}

/**
 * Prior-fit, current-fit and Bayesian-blended RMSE side by side, so dragging
 * prior weight visibly trades the red bar's influence against the green
 * one's in the blended (gold) result.
 */
export function PredictRmseBars({ predict, className }: PredictRmseBarsProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 48, right: 16, top: 16, bottom: 24 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: ["Last season", "This season", "Blended"] },
      yAxis: { type: "value", name: "RMSE (positions)" },
      series: [
        {
          type: "bar",
          data: [
            { value: predict?.prior.rmse ?? 0, itemStyle: { color: colors.red } },
            { value: predict?.current.rmse ?? 0, itemStyle: { color: colors.green } },
            { value: predict?.blended_rmse ?? 0, itemStyle: { color: colors.gold } },
          ],
        },
      ],
    }),
    [predict],
  );

  return <EChart option={option} className={className} />;
}
