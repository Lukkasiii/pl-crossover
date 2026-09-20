import { useEffect, useRef } from "react";
import { useReplay } from "../ws/useReplay";
import { useUrlWeekSync } from "../ws/useUrlWeekSync";
import { StandingsTable } from "./StandingsTable";
import { PlayerControls } from "./PlayerControls";
import { Select } from "./ui/Select";
import { RmseChart } from "../charts/RmseChart";
import { MetricsBarChart } from "../charts/MetricsBarChart";
import { PredictionTuner } from "./PredictionTuner";
import { METRICS, type Metric } from "../ws/types";

const METRIC_LABELS: Record<Metric, string> = { xg: "xG", xgd: "xGD", gd: "GD", points: "Points" };
// Native form tags plus the interactive roles Radix's Select trigger
// (a <button>) and Slider thumb (a <span role="slider">) render as --
// their own key handling should win over the page-level shortcuts below.
const EDITABLE_SELECTOR = 'input, select, textarea, button, [role="slider"], [role="combobox"]';

interface ReplayDashboardProps {
  pairId: number;
  currentSeasonLabel: string;
  metric: Metric;
  onMetricChange: (metric: Metric) => void;
  priorWeight: number;
  onPriorWeightChange: (priorWeight: number) => void;
  obsVariance: number;
}

/**
 * Mounted with `key={pairId}` by the parent, so switching season pairs
 * remounts this component and every hook inside it starts from a clean
 * initial state instead of needing an imperative reset effect.
 */
export function ReplayDashboard({
  pairId,
  currentSeasonLabel,
  metric,
  onMetricChange,
  priorWeight,
  onPriorWeightChange,
  obsVariance,
}: ReplayDashboardProps) {
  const replay = useReplay(pairId);
  const ready = replay.status === "open" && replay.totalFrames > 0;
  useUrlWeekSync(ready, replay.latestRound?.games, replay.seekToWeek);

  // The demo must not open empty. Autoplay once the stream is ready, but:
  // - if the URL already names a week (a shared link), resume playback from
  //   there instead of restarting from zero. useUrlWeekSync's own seek can
  //   still be in flight (a real network round trip over the socket), so
  //   wait for the round panel to actually reach that week rather than
  //   racing a `play` command against it.
  // - under prefers-reduced-motion, don't auto-advance through the season at
  //   all -- just land on the first frame (unless a URL week already placed
  //   us somewhere) so the page opens showing something instead of nothing.
  //   Landing on the *last* frame would read better, but reaching it means
  //   `seek`ing there, and seek fetches one round trip per frame over the
  //   live socket (see useReplaySocket) -- fine for a user-initiated jump,
  //   not something to fire unprompted on load.
  const autoplayedRef = useRef(false);
  useEffect(() => {
    if (autoplayedRef.current || !ready || replay.seeking) return;

    const weekParam = Number(new URLSearchParams(window.location.search).get("week"));
    const hasUrlWeek = Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= 38;
    if (hasUrlWeek && replay.latestRound?.games !== weekParam) return; // still catching up to it

    autoplayedRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!hasUrlWeek) replay.seek(0);
    } else {
      replay.play();
    }
  }, [ready, replay]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest(EDITABLE_SELECTOR)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (replay.playing) replay.pause();
        else replay.play();
      } else if (e.code === "ArrowRight") {
        replay.seek(replay.seq + 1);
      } else if (e.code === "ArrowLeft") {
        replay.seek(replay.seq - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [replay]);

  return (
    <main>
      <div className="layout">
        <div className="charts-column">
          <section className="panel">
            <div className="panel-header">
              <h2>RMSE curve</h2>
              <Select
                aria-label="metric"
                value={metric}
                onValueChange={(v) => onMetricChange(v as Metric)}
                options={METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
              />
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
        </div>

        <div className="side-column">
          <PredictionTuner
            metric={metric}
            games={replay.latestRound?.games ?? 1}
            priorWeight={priorWeight}
            onPriorWeightChange={onPriorWeightChange}
            obsVariance={obsVariance}
          />

          <section className="panel standings">
            <h2>Standings</h2>
            <StandingsTable rows={replay.table} currentSeasonLabel={currentSeasonLabel} />
          </section>
        </div>
      </div>

      <PlayerControls
        status={replay.status}
        playing={replay.playing}
        speed={replay.speed}
        seq={replay.seq}
        totalFrames={replay.totalFrames}
        finished={replay.finished}
        seeking={replay.seeking}
        onPlay={replay.play}
        onPause={replay.pause}
        onSpeedChange={() => {}}
        onSeek={replay.seek}
      />
    </main>
  );
}
