import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PlayerControls } from "../components/PlayerControls";
import { Select } from "../components/ui/Select";
import { StandingsTable } from "../components/StandingsTable";
import { RmseChart } from "../charts/RmseChart";
import { METRIC_LABEL_KEYS } from "../metricLabels";
import { useLocale } from "../i18n/LocaleContext";
import { useReplayParams } from "../state/ReplayParamsContext";
import { useReplaySession } from "../state/ReplaySessionContext";
import { useUrlWeekSync } from "../ws/useUrlWeekSync";
import { METRICS, type Metric } from "../ws/types";

// Native form tags plus the interactive roles Radix's Select trigger
// (a <button>) and Slider thumb (a <span role="slider">) render as --
// their own key handling should win over the page-level shortcuts below.
const EDITABLE_SELECTOR = 'input, select, textarea, button, [role="slider"], [role="combobox"]';

export default function Season() {
  const { t } = useLocale();
  const { metric, setMetric } = useReplayParams();
  const { pairs, seasonsError, activePairId, activePair, setPairId, replay } = useReplaySession();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    document.title = `${t("nav.season")} — ${t("nav.siteTitle")}`;
  }, [t]);

  const ready = replay !== null && replay.status === "open" && replay.totalFrames > 0;
  useUrlWeekSync(ready, replay?.latestRound?.games, replay?.seekToWeek ?? (() => {}));

  // Only known once the replay has actually streamed the round where it
  // first turns true for the active metric -- same source as RmseChart's
  // own marker (roundsSoFar), so the two markers can never disagree.
  const crossoverSeq = useMemo(() => {
    const round = replay?.roundsSoFar.find((r) => r.metrics[metric].crossover_passed);
    return round?.seq ?? null;
  }, [replay?.roundsSoFar, metric]);

  // The demo must not open on an empty page, but it must not move on its
  // own either -- the replay starts on a click. Land on the very first
  // frame (the full 20-row table, real chart axes) the moment the stream is
  // ready, unless the URL already names a week (a shared link): seeking
  // here too would race useUrlWeekSync's own seek under useReplaySocket's
  // single-seek-at-a-time guard, so that case is left entirely to it.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !ready || !replay) return;
    initializedRef.current = true;

    const weekParam = Number(searchParams.get("week"));
    const hasUrlWeek = Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= 38;
    if (!hasUrlWeek) replay.seek(0);
  }, [ready, replay, searchParams]);

  useEffect(() => {
    if (!replay) return;
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
    <div data-testid="page-season" className="season-page">
      <header className="app-header">
        <h1>{t("nav.season")}</h1>
        <p className="subtitle">{t("app.subtitle")}</p>

        <div className="toolbar">
          <Select
            aria-label={t("app.seasonPairLabel")}
            data-testid="season-pair-select"
            value={String(activePairId ?? "")}
            onValueChange={(v) => setPairId(Number(v))}
            disabled={!pairs}
            options={pairs?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
          />
          {seasonsError && <span className="error">{seasonsError}</span>}
        </div>
      </header>

      {replay && activePair && (
        <>
          <div className="season-layout">
            <section className="panel standings-panel">
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
              <StandingsTable rows={replay.table} currentSeasonLabel={activePair.current_season} />
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>{t("replay.rmseCurve")}</h2>
                <Select
                  aria-label={t("replay.metricLabel")}
                  data-testid="metric-select"
                  value={metric}
                  onValueChange={(v) => setMetric(v as Metric)}
                  options={METRICS.map((m) => ({ value: m, label: t(METRIC_LABEL_KEYS[m]) }))}
                />
              </div>
              <div className="chart-box">
                <RmseChart metric={metric} roundsSoFar={replay.roundsSoFar} />
              </div>
            </section>
          </div>

          <PlayerControls
            status={replay.status}
            playing={replay.playing}
            speed={replay.speed}
            seq={replay.seq}
            totalFrames={replay.totalFrames}
            finished={replay.finished}
            seeking={replay.seeking}
            match={replay.match}
            table={replay.table}
            seasonStart={activePair.season_start}
            seasonEnd={activePair.season_end}
            crossoverSeq={crossoverSeq}
            frameAt={replay.frameAt}
            onPlay={replay.play}
            onPause={replay.pause}
            onSpeedChange={() => {}}
            onSeek={replay.seek}
          />
        </>
      )}
    </div>
  );
}
