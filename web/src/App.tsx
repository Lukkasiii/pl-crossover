import { useState } from "react";
import { useSeasons } from "./api/useSeasons";
import { ReplayDashboard } from "./components/ReplayDashboard";
import { Select } from "./components/ui/Select";
import type { Metric } from "./ws/types";
import "./App.css";

function App() {
  const { pairs, error: seasonsError } = useSeasons();
  const [pairId, setPairId] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("points");

  const activePairId = pairId ?? pairs?.[0]?.id ?? null;
  const activePair = pairs?.find((p) => p.id === activePairId) ?? null;

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
        </div>
      </header>

      {activePairId !== null && activePair !== null && (
        <ReplayDashboard
          key={activePairId}
          pairId={activePairId}
          currentSeasonLabel={activePair.current_season}
          metric={metric}
          onMetricChange={setMetric}
        />
      )}
    </div>
  );
}

export default App;
