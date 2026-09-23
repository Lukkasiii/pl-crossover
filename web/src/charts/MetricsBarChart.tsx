import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { getColors } from "../theme";
import { useLocale } from "../i18n/LocaleContext";
import { METRIC_LABEL_KEYS } from "../metricLabels";
import { METRICS, type RoundFrame } from "../ws/types";

interface MetricsBarChartProps {
  latestRound: RoundFrame | null;
}

export function MetricsBarChart({ latestRound }: MetricsBarChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (v) => (v as number).toFixed(2) },
      xAxis: { type: "category", data: METRICS.map((m) => t(METRIC_LABEL_KEYS[m])) },
      yAxis: { type: "value", name: t("chart.currentRmse"), axisLabel: { formatter: (v: number) => v.toFixed(2) } },
      series: [
        {
          name: t("chart.currentSeasonRmse"),
          type: "bar",
          data: METRICS.map((m) => latestRound?.metrics[m]?.rmse ?? 0),
          itemStyle: { color: getColors().green },
        },
      ],
    }),
    [latestRound, t],
  );

  return <EChart option={option} />;
}
