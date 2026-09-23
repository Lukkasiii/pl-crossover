import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { useTeamSeasons } from "../api/useTeamSeasons";
import { Select } from "../components/ui/Select";
import { RankLineChart } from "../charts/RankLineChart";
import { broadcastName } from "../teamNames";
import { summarize } from "./Teams";

export default function TeamDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useLocale();
  const { teams, error } = useTeamSeasons();
  const team = useMemo(() => teams?.find((tm) => tm.slug === slug) ?? null, [teams, slug]);
  const [selectedPairId, setSelectedPairId] = useState<number | null>(null);

  useEffect(() => {
    const title = team ? broadcastName(team.name) : t("teamDetail.notFound.title");
    document.title = `${title} — ${t("nav.siteTitle")}`;
  }, [team, t]);

  // Defaults to the most recent season once the team's data has loaded --
  // not on every render, so picking an earlier season from the Select below sticks.
  useEffect(() => {
    if (team && selectedPairId === null) setSelectedPairId(team.seasons[team.seasons.length - 1].pairId);
  }, [team, selectedPairId]);

  if (error) return <p className="placeholder-note">{t("teams.failedToLoad")}</p>;
  if (!teams) return <p className="placeholder-note">{t("app.loadingPage")}</p>;

  if (!team) {
    return (
      <div data-testid="page-team-detail-not-found">
        <header className="app-header">
          <h1>{t("teamDetail.notFound.title")}</h1>
          <p className="subtitle">{t("teamDetail.notFound.body", { slug: slug ?? "" })}</p>
        </header>
        <Link to="/teams" data-testid="team-not-found-back-link">
          {t("teamDetail.notFound.backLink")}
        </Link>
      </div>
    );
  }

  const stats = summarize(team);
  const selectedSeason = team.seasons.find((s) => s.pairId === selectedPairId) ?? team.seasons[team.seasons.length - 1];

  return (
    <div data-testid="page-team-detail">
      <header className="app-header">
        <h1>{broadcastName(team.name)}</h1>
        <p className="subtitle">{t("teamDetail.seasonsInSample", { count: stats.seasonsPlayed })}</p>
        <div className="toolbar">
          <span className="predict-value">
            {t("teamDetail.bestRank")}: #{stats.bestRank}
          </span>
          <span className="predict-value">
            {t("teamDetail.worstRank")}: #{stats.worstRank}
          </span>
        </div>
      </header>

      <div className="page-stack">
        <section className="panel">
          <h2>{t("teamDetail.chart.bySeason.heading")}</h2>
          <div className="chart-box">
            <RankLineChart
              categories={team.seasons.map((s) => s.season)}
              ranks={team.seasons.map((s) => s.finalRank)}
              xAxisName={t("teamDetail.seasonSelectLabel")}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t("teamDetail.chart.byGame.heading")}</h2>
            <Select
              aria-label={t("teamDetail.seasonSelectLabel")}
              data-testid="team-season-select"
              value={String(selectedSeason.pairId)}
              onValueChange={(v) => setSelectedPairId(Number(v))}
              options={team.seasons.map((s) => ({ value: String(s.pairId), label: s.season }))}
            />
          </div>
          <div className="chart-box">
            <RankLineChart
              categories={selectedSeason.rankByGame.map((_, i) => i + 1)}
              ranks={selectedSeason.rankByGame}
              xAxisName={t("chart.gamesPlayed")}
            />
          </div>
        </section>

        <section className="panel">
          <h2>{t("teamDetail.table.heading")}</h2>
          <table className="method-results-table" data-testid="team-seasons-table">
            <thead>
              <tr>
                <th scope="col">{t("teamDetail.table.season")}</th>
                <th scope="col">{t("teamDetail.table.finalRank")}</th>
                <th scope="col">{t("teamDetail.table.points")}</th>
                <th scope="col">{t("teamDetail.table.gd")}</th>
                <th scope="col">{t("teamDetail.table.xg")}</th>
                <th scope="col">{t("teamDetail.table.xga")}</th>
                <th scope="col">{t("teamDetail.table.xgd")}</th>
                <th scope="col" style={{ textAlign: "left" }}>
                  {t("teamDetail.table.sample")}
                </th>
              </tr>
            </thead>
            <tbody>
              {team.seasons.map((s) => (
                <tr key={s.pairId}>
                  <th scope="row">{s.season}</th>
                  <td>#{s.finalRank}</td>
                  <td>{s.points}</td>
                  <td>{s.gd}</td>
                  <td>{s.xg.toFixed(2)}</td>
                  <td>{s.xga.toFixed(2)}</td>
                  <td>{s.xgd.toFixed(2)}</td>
                  {/* Text, not colour alone -- see CLAUDE.md "Promoted teams have no
                      prior-season record" and "3c. /teams": outside-sample rows are
                      explained in words here, the same rule the standings table follows. */}
                  <td style={{ textAlign: "left" }}>
                    {s.inPair ? t("teamDetail.table.inSample") : t("teamDetail.table.outsideSample")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
