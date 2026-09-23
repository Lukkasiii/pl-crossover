import { useEffect, useState } from "react";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import { lookupPooledCurve, type PooledCurve } from "../demo/predictGrid";
import type { Metric } from "../ws/types";

export type { PooledCurve } from "../demo/predictGrid";

async function fetchPooledCurveLive(metric: Metric): Promise<PooledCurve> {
  const { data, error } = await api.GET("/api/curves", { params: { query: { metric, method: "pooled" } } });
  if (error) throw new Error("GET /api/curves failed");
  return { games: data.games, currentRmse: data.current_rmse, priorRmse: data.prior.rmse };
}

/**
 * The pooled-regression RMSE-by-games-played curve for one metric, with no
 * dependency on a live replay session -- used by Overview, which needs the
 * full-season shape of the curve but not a WebSocket. See usePredict.ts for
 * the equivalent demo/live split for a single (metric, games) cell.
 */
export function usePooledCurve(metric: Metric) {
  const [curve, setCurve] = useState<PooledCurve | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (DEMO_MODE ? lookupPooledCurve(metric) : fetchPooledCurveLive(metric))
      .then((data) => {
        if (!cancelled) setCurve(data);
      })
      .catch(() => {
        if (!cancelled) setError("failed to load curve");
      });
    return () => {
      cancelled = true;
    };
  }, [metric]);

  return { curve, error };
}
