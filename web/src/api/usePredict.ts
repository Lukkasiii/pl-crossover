import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import type { Metric } from "../ws/types";
import type { components } from "./schema";

export type PredictOut = components["schemas"]["PredictOut"];

export const DEFAULT_OBS_VARIANCE = 1.5;

async function fetchPredict(metric: Metric, games: number, priorWeight: number, obsVariance: number) {
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
 */
export function usePredict(metric: Metric, games: number, priorWeight: number, obsVariance = DEFAULT_OBS_VARIANCE) {
  return useQuery<PredictOut>({
    queryKey: ["predict", metric, games, priorWeight, obsVariance],
    queryFn: () => fetchPredict(metric, games, priorWeight, obsVariance),
    // No backend in the static demo build -- see DEMO_MODE in demo/mode.ts.
    enabled: !DEMO_MODE,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}
