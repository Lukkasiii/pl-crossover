import type { PredictOut } from "../api/usePredict";
import type { Metric } from "../ws/types";

interface FitEntry {
  rmse: number;
  mae: number;
  r2: number;
  n: number;
}

interface PredictGrid {
  games: number[];
  priorWeights: number[];
  obsVariance: number;
  priorFit: Record<Metric, FitEntry>;
  currentFit: Record<Metric, FitEntry[]>;
  weightPrior: number[][];
  weightData: number[][];
  blendedRmse: Record<Metric, number[][]>;
  blendedMae: Record<Metric, number[][]>;
}

/**
 * /api/predict is a pure function of (metric, games, prior_weight,
 * obs_variance), so scripts/export_predict_grid.py bakes every response the
 * slider could ask for (obs_variance fixed at the model default -- the
 * slider only tunes prior_weight) into one static file at build time. This
 * fetches it once and serves lookups from it in place of the network call
 * useSeasons.ts's fetchSeasons/DEMO_MODE branch is the same pattern for the
 * season list.
 */
let gridPromise: Promise<PredictGrid> | null = null;

function loadGrid(): Promise<PredictGrid> {
  if (!gridPromise) {
    gridPromise = fetch(`${import.meta.env.BASE_URL}demo/predict-grid.json`).then((res) => {
      if (!res.ok) throw new Error(`demo/predict-grid.json: ${res.status}`);
      return res.json();
    });
  }
  return gridPromise;
}

export async function lookupPredict(metric: Metric, games: number, priorWeight: number): Promise<PredictOut> {
  const grid = await loadGrid();
  // Index arithmetic, not a search: both axes are contiguous step-1 ranges
  // fixed by export_predict_grid.py. That coupling is invisible at the call
  // site, so a value the grid never baked fails here rather than rendering
  // an empty chart from an undefined cell.
  const gi = games - grid.games[0];
  const pi = priorWeight - grid.priorWeights[0];
  if (grid.games[gi] !== games || grid.priorWeights[pi] !== priorWeight) {
    throw new Error(
      `demo grid has no cell for games=${games}, prior_weight=${priorWeight}. ` +
        `Re-run scripts/export_predict_grid.py if the slider's range or step changed.`,
    );
  }
  return {
    metric,
    games,
    prior_weight: priorWeight,
    obs_variance: grid.obsVariance,
    prior: grid.priorFit[metric],
    current: grid.currentFit[metric][gi],
    blended_rmse: grid.blendedRmse[metric][gi][pi],
    blended_mae: grid.blendedMae[metric][gi][pi],
    weight_prior: grid.weightPrior[gi][pi],
    weight_data: grid.weightData[gi][pi],
  };
}
