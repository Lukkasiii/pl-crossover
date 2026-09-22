import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_OBS_VARIANCE } from "../api/usePredict";
import type { ScenarioParams } from "../api/useScenarios";
import type { Metric } from "../ws/types";

const DEFAULT_PRIOR_WEIGHT = 5;

// Fixed, not a toggle yet -- CLAUDE.md offers per-season as a future method,
// but no control sets it, so every scenario this app can save or load is
// pooled. ScenarioParams still carries the field; see ScenariosPanel.
const METHOD: ScenarioParams["method"] = "pooled";

interface ReplayParamsValue {
  metric: Metric;
  setMetric: (metric: Metric) => void;
  priorWeight: number;
  setPriorWeight: (priorWeight: number) => void;
  obsVariance: number;
  currentScenarioParams: ScenarioParams;
  loadScenario: (params: ScenarioParams) => void;
}

const ReplayParamsContext = createContext<ReplayParamsValue | null>(null);

/**
 * Lifted above /season and /scenarios (both live under this provider in
 * AppShell) so "save current" on the scenarios page can capture whatever
 * the replay dashboard is tuned to, and "load" can push a saved scenario
 * back onto the dashboard, even though the two now live on different
 * routes. obsVariance has no control yet (per PredictionTuner), so it is
 * never part of what a scenario saves or restores -- same as before v2.
 */
export function ReplayParamsProvider({ children }: { children: ReactNode }) {
  const [metric, setMetric] = useState<Metric>("points");
  const [priorWeight, setPriorWeight] = useState(DEFAULT_PRIOR_WEIGHT);
  const [obsVariance] = useState(DEFAULT_OBS_VARIANCE);

  const currentScenarioParams: ScenarioParams = {
    metric,
    method: METHOD,
    prior_weight: priorWeight,
    obs_variance: obsVariance,
  };

  const loadScenario = (params: ScenarioParams) => {
    setMetric(params.metric);
    setPriorWeight(params.prior_weight);
  };

  return (
    <ReplayParamsContext.Provider
      value={{ metric, setMetric, priorWeight, setPriorWeight, obsVariance, currentScenarioParams, loadScenario }}
    >
      {children}
    </ReplayParamsContext.Provider>
  );
}

export function useReplayParams(): ReplayParamsValue {
  const ctx = useContext(ReplayParamsContext);
  if (!ctx) throw new Error("useReplayParams must be used within a ReplayParamsProvider");
  return ctx;
}
