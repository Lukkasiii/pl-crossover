import { Suspense, lazy, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { usePooledCurve } from "../api/usePooledCurve";
import type { RoundFrame, RoundMetric } from "../ws/types";
import styles from "./Overview.module.css";

// / must stay ECharts-free at first paint (see CLAUDE.md "v2 -- multi-page
// dashboard"): the hero, stat cards and nav cards below render immediately,
// and only the chart chunk (RmseChart + its EChart/echarts-core dependency)
// loads behind this second Suspense boundary, after the route's own.
const RmseChart = lazy(() => import("../charts/RmseChart").then((m) => ({ default: m.RmseChart })));

// Sourced from CLAUDE.md "Results to preserve" / "The model", not recomputed
// here -- see this task's standing rule against inventing statistics.
const CROSSOVER_XG_GAMES = "11.8";
const OBSERVATIONS = "136"; // 17 common teams x 8 season pairs
const SEASON_PAIRS = "8";
const REPLAY_FRAMES = "418"; // 380 match frames + 38 round frames, per pair

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function NavCard({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link className={styles.navCard} to={to}>
      <p className={styles.navCardTitle}>{title}</p>
      <p className={styles.navCardBody}>{body}</p>
    </Link>
  );
}

export default function Overview() {
  const { t } = useLocale();
  const { curve } = usePooledCurve("xg");

  useEffect(() => {
    document.title = `${t("nav.overview")} — ${t("nav.siteTitle")}`;
  }, [t]);

  // RmseChart takes RoundFrame[] (the replay's own shape) so it can be reused
  // unchanged here -- built from the pooled curve's per-game fits rather than
  // a live stream. Only "xg" is ever read (the metric prop below is fixed),
  // so the other three keys just satisfy Record<Metric, RoundMetric>.
  const roundsSoFar = useMemo<RoundFrame[]>(() => {
    if (!curve) return [];
    return curve.games.map((games, i) => {
      const m: RoundMetric = {
        rmse: curve.currentRmse[i],
        mae: 0,
        r2: 0,
        prior_rmse: curve.priorRmse,
        crossover_passed: curve.currentRmse[i] < curve.priorRmse,
      };
      return { type: "round", seq: i, games, weights: { prior: 0, data: 0 }, metrics: { xg: m, xgd: m, gd: m, points: m } };
    });
  }, [curve]);

  return (
    <div data-testid="page-overview">
      <section className={styles.hero}>
        <p className={styles.hook}>{t("overview.hook")}</p>
        <h1 className={styles.headline}>
          <span className={styles.headlineNumber}>{CROSSOVER_XG_GAMES}</span>
          <span className={styles.headlineUnit}>{t("overview.headlineUnit")}</span>
        </h1>
        <p className={styles.headlineSub}>{t("overview.headlineSub")}</p>
        <p className={styles.headlineNote}>{t("overview.headlineNote")}</p>
      </section>

      <div className={styles.stats}>
        <StatCard value={CROSSOVER_XG_GAMES} label={t("overview.stat.crossover")} />
        <StatCard value={OBSERVATIONS} label={t("overview.stat.observations")} />
        <StatCard value={SEASON_PAIRS} label={t("overview.stat.pairs")} />
        <StatCard value={REPLAY_FRAMES} label={t("overview.stat.frames")} />
      </div>

      <Suspense fallback={<div className="chart-box" />}>
        <div className="chart-box">
          <RmseChart metric="xg" roundsSoFar={roundsSoFar} />
        </div>
      </Suspense>

      <div className={styles.navCards}>
        <NavCard to="/season" title={t("nav.season")} body={t("overview.nav.season.body")} />
        <NavCard to="/model" title={t("nav.model")} body={t("overview.nav.model.body")} />
        <NavCard to="/teams" title={t("nav.teams")} body={t("overview.nav.teams.body")} />
      </div>
    </div>
  );
}
