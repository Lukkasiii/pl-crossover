import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { ECHARTS_THEME } from "../theme";

// Register only the pieces these three panels use, not the full echarts
// bundle -- see README "Frontend decisions" for the before/after bundle size.
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DatasetComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsOption;
  className?: string;
}

/**
 * One instance per mount, updated in place via setOption. Re-creating the
 * chart every render (or every WS frame) is the naive path that drops
 * frames once the replay speeds up.
 */
export function EChart({ option, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, ECHARTS_THEME);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option);
  }, [option]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
