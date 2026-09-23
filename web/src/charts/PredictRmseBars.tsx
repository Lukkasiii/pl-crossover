import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { getColors } from "../theme";
import { useLocale } from "../i18n/LocaleContext";
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
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    return {
      grid: { left: 48, right: 16, top: 16, bottom: 24 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: [t("chart.lastSeason"), t("chart.thisSeason"), t("chart.blended")] },
      yAxis: { type: "value", name: t("chart.rmsePositions") },
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
    };
  }, [predict, t]);

  return <EChart option={option} className={className} />;
}
