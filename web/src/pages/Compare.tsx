import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { useTeamSeasons, type TeamOut } from "../api/useTeamSeasons";
import { useSeasons } from "../api/useSeasons";
import { usePairCurve } from "../api/usePairCurve";
import { usePooledCurve } from "../api/usePooledCurve";
import { Select } from "../components/ui/Select";
import { RankLineChart } from "../charts/RankLineChart";
import { CompareCurveChart } from "../charts/CompareCurveChart";
import { broadcastName } from "../teamNames";
import { MEAN_POINTS_FORMAT, summarize, type TeamStats } from "./Teams";
import styles from "./Compare.module.css";

type Mode = "teams" | "pairs";

const STAT_ROWS: {
  key: keyof TeamStats;
  labelKey: "teams.card.seasons" | "teams.card.bestRank" | "teams.card.worstRank" | "teams.card.meanPoints";
  // Only meanPoints is a genuine mean (can be a non-integer); the other
  // three are plain counts/ranks that are always whole, so forcing a
  // decimal on them would claim a precision the stat doesn't have.
  format?: Intl.NumberFormatOptions;
}[] = [
  { key: "seasonsPlayed", labelKey: "teams.card.seasons" },
  { key: "bestRank", labelKey: "teams.card.bestRank" },
  { key: "worstRank", labelKey: "teams.card.worstRank" },
  { key: "meanPoints", labelKey: "teams.card.meanPoints", format: MEAN_POINTS_FORMAT },
];

function TeamsCompare({ teams }: { teams: TeamOut[] }) {
  const { t, formatNumber } = useLocale();
  const { pairs } = useSeasons();
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);

  // No default-selecting effect needed -- teamA/teamB already fall back to
  // teams[0]/teams[1] below whenever nothing has been picked yet.
  const teamA = teams.find((tm) => tm.id === teamAId) ?? teams[0];
  const teamB = teams.find((tm) => tm.id === teamBId) ?? teams[1];

  const categories = pairs?.map((p) => p.current_season) ?? [];
  const ranksFor = (team: TeamOut) => (pairs ?? []).map((p) => team.seasons.find((s) => s.pairId === p.id)?.finalRank ?? null);

  const statsA = summarize(teamA);
  const statsB = summarize(teamB);

  return (
    <>
      <div className={styles.pickers}>
        <div className={styles.picker}>
          <span>{t("compare.teamALabel")}</span>
          <Select
            aria-label={t("compare.teamALabel")}
            data-testid="compare-team-a"
            value={String(teamA.id)}
            onValueChange={(v) => setTeamAId(Number(v))}
            options={teams.map((tm) => ({ value: String(tm.id), label: broadcastName(tm.name) }))}
          />
        </div>
        <div className={styles.picker}>
          <span>{t("compare.teamBLabel")}</span>
          <Select
            aria-label={t("compare.teamBLabel")}
            data-testid="compare-team-b"
            value={String(teamB.id)}
            onValueChange={(v) => setTeamBId(Number(v))}
            options={teams.map((tm) => ({ value: String(tm.id), label: broadcastName(tm.name) }))}
          />
        </div>
      </div>

      <div className="page-stack">
        <section className="panel">
          <h2>{t("compare.chart.rankBySeason.heading")}</h2>
          <div className="chart-box rank">
            <RankLineChart
              categories={categories}
              series={[
                { name: broadcastName(teamA.name), ranks: ranksFor(teamA) },
                { name: broadcastName(teamB.name), ranks: ranksFor(teamB) },
              ]}
              xAxisName={t("teamDetail.seasonSelectLabel")}
            />
          </div>
        </section>

        <section className="panel">
          <h2>{t("compare.table.heading")}</h2>
          <table className="method-results-table" data-testid="compare-teams-table">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>
                  {t("compare.table.stat")}
                </th>
                <th scope="col">{broadcastName(teamA.name)}</th>
                <th scope="col">{broadcastName(teamB.name)}</th>
                <th scope="col">{t("compare.table.delta")}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row" style={{ textAlign: "left" }}>
                    {t(row.labelKey)}
                  </th>
                  <td>{formatNumber(statsA[row.key], row.format)}</td>
                  <td>{formatNumber(statsB[row.key], row.format)}</td>
                  <td>{formatNumber(Math.round((statsA[row.key] - statsB[row.key]) * 10) / 10, row.format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function PairsCompare() {
  const { t } = useLocale();
  const { pairs } = useSeasons();
  const [pairAId, setPairAId] = useState<number | null>(null);
  const [pairBId, setPairBId] = useState<number | null>(null);

  // Nothing picked yet falls back to the first two pairs, once pairs has
  // loaded -- derived here (not in an effect) so usePairCurve below gets a
  // real id from the very first render that pairs is non-null.
  const effectiveAId = pairAId ?? pairs?.[0]?.id ?? null;
  const effectiveBId = pairBId ?? pairs?.[Math.min(1, (pairs?.length ?? 1) - 1)]?.id ?? null;

  const { curve: curveA } = usePairCurve("xg", effectiveAId);
  const { curve: curveB } = usePairCurve("xg", effectiveBId);
  // The held-out-checked reference the two in-sample pair curves are drawn
  // against -- see the caption below and CLAUDE.md's "in-sample and
  // held-out scores are always reported together".
  const { curve: pooledCurve } = usePooledCurve("xg");

  if (!pairs) return <p className="placeholder-note">{t("app.loadingPage")}</p>;

  const pairA = pairs.find((p) => p.id === effectiveAId) ?? pairs[0];
  const pairB = pairs.find((p) => p.id === effectiveBId) ?? pairs[Math.min(1, pairs.length - 1)];

  return (
    <>
      <div className={styles.pickers}>
        <div className={styles.picker}>
          <span>{t("compare.pairALabel")}</span>
          <Select
            aria-label={t("compare.pairALabel")}
            data-testid="compare-pair-a"
            value={String(pairA.id)}
            onValueChange={(v) => setPairAId(Number(v))}
            options={pairs.map((p) => ({ value: String(p.id), label: p.label }))}
          />
        </div>
        <div className={styles.picker}>
          <span>{t("compare.pairBLabel")}</span>
          <Select
            aria-label={t("compare.pairBLabel")}
            data-testid="compare-pair-b"
            value={String(pairB.id)}
            onValueChange={(v) => setPairBId(Number(v))}
            options={pairs.map((p) => ({ value: String(p.id), label: p.label }))}
          />
        </div>
      </div>

      <section className="panel">
        <h2>{t("compare.chart.rmseCurves.heading")}</h2>
        <p className="panel-framing">{t("compare.chart.rmseCurves.caption")}</p>
        {curveA && curveB ? (
          <div className="chart-box">
            <CompareCurveChart
              curveA={curveA}
              curveB={curveB}
              labelA={t("compare.chart.pairLabelWithN", { label: pairA.label, n: curveA.n })}
              labelB={t("compare.chart.pairLabelWithN", { label: pairB.label, n: curveB.n })}
              pooledCrossover={pooledCurve?.crossover ?? null}
            />
          </div>
        ) : (
          <p className="placeholder-note">{t("app.loadingPage")}</p>
        )}
      </section>
    </>
  );
}

export default function Compare() {
  const { t } = useLocale();
  const { teams, error } = useTeamSeasons();
  const [mode, setMode] = useState<Mode>("teams");

  useEffect(() => {
    document.title = `${t("nav.compare")} — ${t("nav.siteTitle")}`;
  }, [t]);

  return (
    <div data-testid="page-compare">
      <header className="app-header">
        <h1>{t("nav.compare")}</h1>
        <p className="subtitle">{t("compare.subtitle")}</p>
      </header>

      <div className={styles.modeToggle} role="group" aria-label={t("compare.modeLabel")}>
        <button type="button" aria-pressed={mode === "teams"} onClick={() => setMode("teams")} data-testid="compare-mode-teams">
          {t("compare.mode.teams")}
        </button>
        <button type="button" aria-pressed={mode === "pairs"} onClick={() => setMode("pairs")} data-testid="compare-mode-pairs">
          {t("compare.mode.pairs")}
        </button>
      </div>

      {mode === "teams" &&
        (error ? (
          <p className="placeholder-note">{t("teams.failedToLoad")}</p>
        ) : teams && teams.length > 1 ? (
          <TeamsCompare teams={teams} />
        ) : (
          <p className="placeholder-note">{t("app.loadingPage")}</p>
        ))}

      {mode === "pairs" && <PairsCompare />}
    </div>
  );
}
