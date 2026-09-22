import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { colors } from "../theme";
import { useLocale } from "../i18n/LocaleContext";
import { METRICS, type RoundFrame } from "../ws/types";
import type { TranslationKey } from "../i18n/dictionaries";

const LABEL_KEYS: Record<string, TranslationKey> = {
  xg: "replay.metric.xg",
  xgd: "replay.metric.xgd",
  gd: "replay.metric.gd",
  points: "replay.metric.points",
};

interface MetricsBarChartProps {
  latestRound: RoundFrame | null;
}

export function MetricsBarChart({ latestRound }: MetricsBarChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: METRICS.map((m) => t(LABEL_KEYS[m])) },
      yAxis: { type: "value", name: t("chart.currentRmse") },
      series: [
        {
          name: t("chart.currentSeasonRmse"),
          type: "bar",
          data: METRICS.map((m) => latestRound?.metrics[m]?.rmse ?? 0),
          itemStyle: { color: colors.green },
        },
      ],
    }),
    [latestRound, t],
  );

  return <EChart option={option} />;
}
