import { useState } from "react";
import { useSeasons } from "./api/useSeasons";
import { ReplayDashboard } from "./components/ReplayDashboard";
import type { Metric } from "./ws/types";
import "./App.css";

function App() {
  const { pairs, error: seasonsError } = useSeasons();
  const [pairId, setPairId] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("points");

  const activePairId = pairId ?? pairs?.[0]?.id ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>PL Crossover</h1>
        <p className="subtitle">When does this season start predicting the final table better than last season did?</p>
      </header>

      <div className="toolbar">
        <label>
          season pair{" "}
          <select
            value={activePairId ?? ""}
            onChange={(e) => setPairId(Number(e.target.value))}
            disabled={!pairs}
          >
            {pairs?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {seasonsError && <span className="error">{seasonsError}</span>}
      </div>

      {activePairId !== null && (
        <ReplayDashboard key={activePairId} pairId={activePairId} metric={metric} onMetricChange={setMetric} />
      )}
    </div>
  );
}

export default App;
