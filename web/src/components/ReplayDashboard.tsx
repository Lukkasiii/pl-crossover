import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useReplay } from "../ws/useReplay";
import { useUrlWeekSync } from "../ws/useUrlWeekSync";
import { StandingsTable } from "./StandingsTable";
import { PlayerControls } from "./PlayerControls";
import { Select } from "./ui/Select";
import { RmseChart } from "../charts/RmseChart";
import { MetricsBarChart } from "../charts/MetricsBarChart";
import { PredictionTuner } from "./PredictionTuner";
import { useLocale } from "../i18n/LocaleContext";
import { METRICS, type Metric } from "../ws/types";

const METRIC_LABEL_KEYS: Record<Metric, "replay.metric.xg" | "replay.metric.xgd" | "replay.metric.gd" | "replay.metric.points"> = {
  xg: "replay.metric.xg",
  xgd: "replay.metric.xgd",
  gd: "replay.metric.gd",
  points: "replay.metric.points",
};
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
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const replay = useReplay(pairId);
  const ready = replay.status === "open" && replay.totalFrames > 0;
  useUrlWeekSync(ready, replay.latestRound?.games, replay.seekToWeek);

  // The demo must not open on an empty page, but it must not move on its
  // own either -- the replay starts on a click. Land on the very first
  // frame (the full 20-row table, real chart axes) the moment the stream is
  // ready, unless the URL already names a week (a shared link): seeking
  // here too would race useUrlWeekSync's own seek under useReplaySocket's
  // single-seek-at-a-time guard, so that case is left entirely to it.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !ready) return;
    initializedRef.current = true;

    const weekParam = Number(searchParams.get("week"));
    const hasUrlWeek = Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= 38;
    if (!hasUrlWeek) replay.seek(0);
  }, [ready, replay, searchParams]);

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
    // AppShell already provides the page's one <main> landmark -- a second
    // one here (this used to be the page's own root, pre-v2) trips axe's
    // landmark-no-duplicate-main / landmark-main-is-top-level rules.
    <div>
      <div className="layout">
        <div className="charts-column">
          <section className="panel">
            <div className="panel-header">
              <h2>{t("replay.rmseCurve")}</h2>
              <Select
                aria-label={t("replay.metricLabel")}
                data-testid="metric-select"
                value={metric}
                onValueChange={(v) => onMetricChange(v as Metric)}
                options={METRICS.map((m) => ({ value: m, label: t(METRIC_LABEL_KEYS[m]) }))}
              />
            </div>
            <div className="chart-box">
              <RmseChart metric={metric} roundsSoFar={replay.roundsSoFar} />
            </div>
          </section>

          <section className="panel">
            <h2>{t("replay.currentRmseByMetric")}</h2>
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
            <div className="panel-header">
              <h2>{t("standings.heading")}</h2>
              {replay.latestRound && (
                <span
                  className="predict-value"
                  data-testid="current-round"
                  data-games={replay.latestRound.games}
                >
                  {t("standings.roundLabel", { games: replay.latestRound.games })}
                </span>
              )}
            </div>
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
    </div>
  );
}
