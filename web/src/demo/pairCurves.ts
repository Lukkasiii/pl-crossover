import type { Metric } from "../ws/types";
import type { PooledCurve } from "./predictGrid";

type PairCurves = Record<string, Record<Metric, { priorRmse: number; currentRmse: number[]; crossover: number | null; n: number }>>;

let pairCurvesPromise: Promise<PairCurves> | null = null;

function loadPairCurves(): Promise<PairCurves> {
  if (!pairCurvesPromise) {
    pairCurvesPromise = fetch(`${import.meta.env.BASE_URL}demo/pair-curves.json`).then((res) => {
      if (!res.ok) throw new Error(`demo/pair-curves.json: ${res.status}`);
      return res.json();
    });
  }
  return pairCurvesPromise;
}

/** One season pair's own RMSE curve -- see api/app/analytics.py's compute_curve(pair_id=...) docstring for why this genuinely differs pair to pair, unlike the pooled/per-season curves. */
export async function lookupPairCurve(metric: Metric, pairId: number): Promise<PooledCurve> {
  const curves = await loadPairCurves();
  const entry = curves[String(pairId)]?.[metric];
  if (!entry) throw new Error(`demo pair-curves.json has no entry for pair ${pairId}, metric ${metric}`);
  return {
    games: Array.from({ length: entry.currentRmse.length }, (_, i) => i + 1),
    currentRmse: entry.currentRmse,
    priorRmse: entry.priorRmse,
    crossover: entry.crossover,
    n: entry.n,
  };
}
