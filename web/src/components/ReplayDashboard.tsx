import { useReplaySocket } from "../ws/useReplaySocket";
import { StandingsTable } from "./StandingsTable";
import { PlayerControls } from "./PlayerControls";
import { RmseChart } from "../charts/RmseChart";
import { MetricsBarChart } from "../charts/MetricsBarChart";
import { WeightBars } from "../charts/WeightBars";
import { METRICS, type Metric } from "../ws/types";

const METRIC_LABELS: Record<Metric, string> = { xg: "xG", xgd: "xGD", gd: "GD", points: "Points" };

interface ReplayDashboardProps {
  pairId: number;
  metric: Metric;
  onMetricChange: (metric: Metric) => void;
}

/**
 * Mounted with `key={pairId}` by the parent, so switching season pairs
 * remounts this component and every hook inside it starts from a clean
 * initial state instead of needing an imperative reset effect.
 */
export function ReplayDashboard({ pairId, metric, onMetricChange }: ReplayDashboardProps) {
  const replay = useReplaySocket(pairId);

  return (
    <>
      <PlayerControls
        status={replay.status}
        playing={replay.playing}
        speed={replay.speed}
        seq={replay.seq}
        totalFrames={replay.totalFrames}
        finished={replay.finished}
        onPlay={replay.play}
        onPause={replay.pause}
        onSpeedChange={() => {}}
      />

      <main className="layout">
        <section className="panel standings">
          <h2>Standings</h2>
          <StandingsTable rows={replay.table} />
        </section>

        <div className="side-panels">
          <section className="panel">
            <div className="panel-header">
              <h2>RMSE curve</h2>
              <select value={metric} onChange={(e) => onMetricChange(e.target.value as Metric)}>
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-box">
              <RmseChart metric={metric} roundsSoFar={replay.roundsSoFar} />
            </div>
          </section>

          <section className="panel">
            <h2>Current RMSE by metric</h2>
            <div className="chart-box">
              <MetricsBarChart latestRound={replay.latestRound} />
            </div>
          </section>

          <section className="panel">
            <h2>Bayesian weight {replay.latestRound?.metrics[metric].crossover_passed && "⚡ CROSSOVER"}</h2>
            <div className="chart-box small">
              <WeightBars latestRound={replay.latestRound} />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
