import { useMemo } from "react";
import type { EChartsOption, LineSeriesOption } from "echarts";
import { EChart } from "./EChart";
import { getColors, getFonts } from "../theme";
import { useLocale } from "../i18n/LocaleContext";
import type { PooledCurve } from "../api/usePooledCurve";

interface CompareCurveChartProps {
  curveA: PooledCurve;
  curveB: PooledCurve;
  labelA: string;
  labelB: string;
}

/**
 * Overlays two season pairs' own RMSE curves (see usePairCurve -- each is a
 * genuinely different regression, unlike the single shared pooled/per-season
 * curve every replay round frame shows) with each one's own crossover
 * marked. Not RmseChart: that component's shape is current-vs-prior for one
 * pair, not pair-vs-pair, and forcing a second unrelated shape onto it would
 * only make both harder to read.
 */
export function CompareCurveChart({ curveA, curveB, labelA, labelB }: CompareCurveChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    const fonts = getFonts();

    // The two crossover markers can land close together on the games axis --
    // one label pinned near the top of its line and the other near the
    // bottom keeps them from drawing on top of each other regardless of how
    // close the two games counts are. The pair name is in the legend and the
    // tooltip already, so the label itself just needs the marker glyph.
    const seriesFor = (curve: PooledCurve, color: string, name: string, labelPosition: "insideEndTop" | "insideEndBottom"): LineSeriesOption => {
      const crossoverIndex = curve.currentRmse.findIndex((v) => v < curve.priorRmse);
      return {
        name,
        type: "line",
        data: curve.currentRmse,
        showSymbol: false,
        itemStyle: { color },
        lineStyle: { width: 2, color },
        markLine:
          crossoverIndex === -1
            ? undefined
            : {
                silent: false,
                symbol: ["none", "circle"],
                symbolSize: 8,
                lineStyle: { color, width: 1, type: "dashed" },
                label: { formatter: t("chart.crossoverMarker"), position: labelPosition, color, fontWeight: "bold", fontSize: 12 },
                data: [{ xAxis: crossoverIndex }],
              },
      };
    };

    return {
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (v) => (v as number).toFixed(2) },
      legend: { top: 0, data: [labelA, labelB] },
      xAxis: {
        type: "category",
        name: t("chart.gamesPlayed"),
        data: curveA.games,
        axisLabel: { fontFamily: fonts.mono },
      },
      yAxis: { type: "value", name: t("chart.rmsePositions"), axisLabel: { formatter: (v: number) => v.toFixed(2) } },
      series: [
        seriesFor(curveA, colors.series1, labelA, "insideEndTop"),
        seriesFor(curveB, colors.series5, labelB, "insideEndBottom"),
      ],
    };
  }, [curveA, curveB, labelA, labelB, t]);

  return <EChart option={option} />;
}
