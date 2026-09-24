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
  /** The pooled fit's own crossover (the held-out-checked reference the rest of the site quotes), drawn as a third line so the two in-sample pair curves are read against it rather than against each other alone. */
  pooledCrossover: number | null;
}

/**
 * Overlays two season pairs' own RMSE curves (see usePairCurve -- each is a
 * genuinely different regression, unlike the single shared pooled/per-season
 * curve every replay round frame shows) with each one's own crossover
 * marked. Not RmseChart: that component's shape is current-vs-prior for one
 * pair, not pair-vs-pair, and forcing a second unrelated shape onto it would
 * only make both harder to read.
 *
 * The x-axis is a numeric "value" axis, not "category" -- a per-pair
 * crossover lands on an exact games count, but the pooled reference line
 * below is a fractional interpolation (11.8, not 12), and a category axis
 * cannot place a mark between two categories.
 */
export function CompareCurveChart({ curveA, curveB, labelA, labelB, pooledCrossover }: CompareCurveChartProps) {
  const { t } = useLocale();
  const option = useMemo<EChartsOption>(() => {
    const colors = getColors();
    const fonts = getFonts();

    // Three vertical labels can land close together on the games axis --
    // stacking one at the top of the line, one at the bottom, and the
    // pooled reference in the middle keeps them apart regardless of how
    // close the three games counts actually are, rather than relying on
    // horizontal spacing that a narrow chart doesn't have.
    const seriesFor = (curve: PooledCurve, color: string, name: string, labelPosition: "insideStartTop" | "insideEndBottom"): LineSeriesOption => ({
      name,
      type: "line",
      data: curve.currentRmse.map((v, i) => [curve.games[i], v]),
      showSymbol: false,
      itemStyle: { color },
      lineStyle: { width: 2, color },
      markLine:
        curve.crossover === null
          ? undefined
          : {
              silent: false,
              symbol: ["none", "circle"],
              symbolSize: 8,
              lineStyle: { color, width: 1, type: "dashed" },
              // The number, not just the word -- two pair curves both
              // labelled plain "crossover" is indistinguishable, and the
              // honest caption's whole point is that these numbers spread
              // out. curve.crossover is the same fractional, interpolated
              // value find_crossover produces server-side (see
              // usePairCurve), not a coarser index-based estimate.
              label: {
                formatter: t("chart.crossoverMarker") + ` (${curve.crossover.toFixed(1)})`,
                position: labelPosition,
                color,
                fontWeight: "bold",
                fontSize: 12,
              },
              data: [{ xAxis: curve.crossover }],
            },
    });

    // A silent, dataless line whose only job is to host the pooled-reference
    // markLine -- ECharts markLines belong to a series, and this one isn't
    // "pair A" or "pair B". Left out of legend.data below so it never shows
    // as a third selectable entry.
    const pooledReference: LineSeriesOption | null =
      pooledCrossover === null
        ? null
        : {
            name: "pooled-reference",
            type: "line",
            data: [],
            silent: true,
            markLine: {
              silent: false,
              symbol: "none",
              // Deliberately recessive -- this is context the two pair
              // curves are read against, not a third series competing with
              // them, so it stays thin, dashed and faded rather than the
              // solid, full-contrast line it was before.
              lineStyle: { color: colors.textSecondary, width: 1, type: "dashed", opacity: 0.6 },
              label: {
                formatter: t("compare.chart.pooledCrossoverLabel", { games: pooledCrossover.toFixed(1) }),
                position: "insideMiddleTop",
                color: colors.textSecondary,
                fontWeight: "bold",
                fontSize: 12,
              },
              data: [{ xAxis: pooledCrossover }],
            },
          };

    return {
      // Extra top padding keeps the y-axis name (which "end", the default
      // nameLocation, draws just above the plot's top-left corner) clear of
      // the legend sitting at the very top of the canvas -- at the previous
      // top: 32 the two overlapped.
      grid: { left: 48, right: 16, top: 56, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (v) => (v as number).toFixed(2) },
      legend: { top: 0, data: [labelA, labelB] },
      xAxis: {
        type: "value",
        name: t("chart.gamesPlayed"),
        nameLocation: "middle",
        nameGap: 28,
        min: 1,
        max: 38,
        axisLabel: { fontFamily: fonts.mono },
      },
      yAxis: {
        type: "value",
        name: t("chart.rmsePositions"),
        nameLocation: "middle",
        nameGap: 36,
        nameRotate: 90,
        // See RmseChart.tsx's identical comment: zero is not a meaningful
        // RMSE here, and anchoring the axis there squashes every real value
        // into a shallow band at the top of the chart.
        scale: true,
        axisLabel: { formatter: (v: number) => v.toFixed(2) },
      },
      series: [
        seriesFor(curveA, colors.series1, labelA, "insideStartTop"),
        seriesFor(curveB, colors.series5, labelB, "insideEndBottom"),
        ...(pooledReference ? [pooledReference] : []),
      ],
    };
  }, [curveA, curveB, labelA, labelB, pooledCrossover, t]);

  return <EChart option={option} />;
}
