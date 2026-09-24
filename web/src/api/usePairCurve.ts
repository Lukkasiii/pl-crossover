import { useEffect, useState } from "react";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import { lookupPairCurve } from "../demo/pairCurves";
import type { PooledCurve } from "./usePooledCurve";
import type { Metric } from "../ws/types";

async function fetchPairCurveLive(metric: Metric, pairId: number): Promise<PooledCurve> {
  const { data, error } = await api.GET("/api/curves", { params: { query: { metric, pair_id: pairId } } });
  if (error) throw new Error("GET /api/curves failed");
  return {
    games: data.games,
    currentRmse: data.current_rmse,
    priorRmse: data.prior.rmse,
    crossover: data.crossover,
    n: data.n_observations,
  };
}

function keyFor(metric: Metric, pairId: number | null): string | null {
  return pairId === null ? null : `${metric}:${pairId}`;
}

/**
 * One season pair's own RMSE curve, scoped server-side to that pair's own
 * ~17 observations (see api/app/analytics.py's compute_curve docstring) --
 * genuinely different pair to pair, unlike the pooled/per-season curves
 * usePooledCurve serves. Used by /compare's "two season pairs" mode.
 *
 * Tags each resolved curve with the (metric, pairId) key it answers, so
 * switching pairId never briefly pairs the new selection's label with the
 * previous selection's curve while the new fetch is in flight -- the
 * mismatch resolves to "no curve yet" instead.
 */
export function usePairCurve(metric: Metric, pairId: number | null) {
  const [result, setResult] = useState<{ key: string; curve: PooledCurve } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pairId === null) return;
    let cancelled = false;
    const key = keyFor(metric, pairId)!;
    (DEMO_MODE ? lookupPairCurve(metric, pairId) : fetchPairCurveLive(metric, pairId))
      .then((data) => {
        if (!cancelled) setResult({ key, curve: data });
      })
      .catch(() => {
        if (!cancelled) setError("failed to load curve");
      });
    return () => {
      cancelled = true;
    };
  }, [metric, pairId]);

  const curve = result?.key === keyFor(metric, pairId) ? result.curve : null;
  return { curve, error };
}
