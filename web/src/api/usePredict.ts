import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import { lookupPredict } from "../demo/predictGrid";
import type { Metric } from "../ws/types";
import type { components } from "./schema";

export type PredictOut = components["schemas"]["PredictOut"];

export const DEFAULT_OBS_VARIANCE = 1.5;

async function fetchPredictLive(metric: Metric, games: number, priorWeight: number, obsVariance: number) {
  const { data, error } = await api.POST("/api/predict", {
    body: { metric, games, prior_weight: priorWeight, obs_variance: obsVariance },
  });
  if (error) throw new Error("POST /api/predict failed");
  return data;
}

/**
 * Keyed by every input the response depends on, so TanStack Query gives us
 * two things for free: a request for an old key resolving after a newer one
 * has already started can never clobber the newer key's cache slot, and
 * dragging back to a `priorWeight` already fetched is a cache hit, not a
 * round trip. `staleTime: Infinity` is safe because /api/predict is a pure
 * function of its inputs -- the regression it recomputes doesn't change
 * between requests.
 *
 * In DEMO_MODE the queryFn reads scripts/export_predict_grid.py's baked
 * (metric, games, prior_weight) grid instead of calling a backend that
 * isn't deployed with the static demo (see demo/predictGrid.ts) -- same
 * cache-key and fade behaviour either way, just a different data source.
 */
export function usePredict(metric: Metric, games: number, priorWeight: number, obsVariance = DEFAULT_OBS_VARIANCE) {
  return useQuery<PredictOut>({
    queryKey: ["predict", metric, games, priorWeight, obsVariance],
    queryFn: () =>
      DEMO_MODE
        ? lookupPredict(metric, games, priorWeight)
        : fetchPredictLive(metric, games, priorWeight, obsVariance),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}
