import { useState } from "react";
import { useSeasons } from "./api/useSeasons";
import { DEFAULT_OBS_VARIANCE } from "./api/usePredict";
import type { ScenarioParams } from "./api/useScenarios";
import { ReplayDashboard } from "./components/ReplayDashboard";
import { Select } from "./components/ui/Select";
import { AuthPanel } from "./components/auth/AuthPanel";
import { ScenariosPanel } from "./components/auth/ScenariosPanel";
import type { Metric } from "./ws/types";
import "./App.css";

const DEFAULT_PRIOR_WEIGHT = 5;

// Fixed, not a toggle yet -- CLAUDE.md offers per-season as a future method,
// but no control sets it, so every scenario this app can save or load is
// pooled. ScenarioParams still carries the field; see ScenariosPanel.
const METHOD: ScenarioParams["method"] = "pooled";

function App() {
  const { pairs, error: seasonsError } = useSeasons();
  const [pairId, setPairId] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("points");
  const [priorWeight, setPriorWeight] = useState(DEFAULT_PRIOR_WEIGHT);
  const [obsVariance] = useState(DEFAULT_OBS_VARIANCE);

  const activePairId = pairId ?? pairs?.[0]?.id ?? null;
  const activePair = pairs?.find((p) => p.id === activePairId) ?? null;

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
    <div className="app">
      <header className="app-header">
        <h1>PL Crossover</h1>
        <p className="subtitle">When does this season start predicting the final table better than last season did?</p>

        <div className="toolbar">
          <Select
            aria-label="season pair"
            value={String(activePairId ?? "")}
            onValueChange={(v) => setPairId(Number(v))}
            disabled={!pairs}
            options={pairs?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
          />
          {seasonsError && <span className="error">{seasonsError}</span>}
          <AuthPanel />
        </div>
      </header>

      {activePairId !== null && activePair !== null && (
        <ReplayDashboard
          key={activePairId}
          pairId={activePairId}
          currentSeasonLabel={activePair.current_season}
          metric={metric}
          onMetricChange={setMetric}
          priorWeight={priorWeight}
          onPriorWeightChange={setPriorWeight}
          obsVariance={obsVariance}
        />
      )}

      <ScenariosPanel current={currentScenarioParams} onLoad={loadScenario} />
    </div>
  );
}

export default App;
