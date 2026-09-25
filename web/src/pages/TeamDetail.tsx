import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { useTeamSeasons } from "../api/useTeamSeasons";
import { useTeamPlayers, type PlayerOut } from "../api/useTeamPlayers";
import { Select } from "../components/ui/Select";
import { InfoTooltip } from "../components/ui/InfoTooltip";
import { RankLineChart } from "../charts/RankLineChart";
import { broadcastName } from "../teamNames";
import { summarize } from "./Teams";
import type { TranslationKey } from "../i18n/dictionaries";
import { parsePosition, type PositionRole } from "../components/positionCodes";

const ROLE_KEY: Record<PositionRole, TranslationKey> = {
  gk: "position.gk",
  d: "position.d",
  m: "position.m",
  f: "position.f",
};

type PlayerSortKey = "minutes" | "goals" | "xg" | "assists" | "xa" | "xgChain" | "xgBuildup";

const PLAYER_SORT_OPTIONS: { value: PlayerSortKey; labelKey: TranslationKey }[] = [
  { value: "minutes", labelKey: "teamDetail.players.sort.minutes" },
  { value: "goals", labelKey: "teamDetail.players.sort.goals" },
  { value: "xg", labelKey: "teamDetail.players.sort.xg" },
  { value: "assists", labelKey: "teamDetail.players.sort.assists" },
  { value: "xa", labelKey: "teamDetail.players.sort.xa" },
  { value: "xgChain", labelKey: "teamDetail.players.sort.xgChain" },
  { value: "xgBuildup", labelKey: "teamDetail.players.sort.xgBuildup" },
];

export default function TeamDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useLocale();
  const { teams, error } = useTeamSeasons();
  const team = useMemo(() => teams?.find((tm) => tm.slug === slug) ?? null, [teams, slug]);
  const [selectedPairId, setSelectedPairId] = useState<number | null>(null);
  const [playerSort, setPlayerSort] = useState<PlayerSortKey>("minutes");

  // Falls back to the most recent season once team data has loaded -- derived
  // here (not in an effect) and called unconditionally, before the
  // not-found return below, because it feeds useTeamPlayers and hooks can't
  // be conditional.
  const effectivePairId = selectedPairId ?? (team && team.seasons.length > 0 ? team.seasons[team.seasons.length - 1].pairId : null);
  const { data: playersData } = useTeamPlayers(effectivePairId, team?.id ?? null);
  const sortedPlayers = useMemo(() => {
    if (!playersData) return [];
    return [...playersData.players].sort((a, b) => b[playerSort] - a[playerSort]);
  }, [playersData, playerSort]);

  useEffect(() => {
    const title = team ? broadcastName(team.name) : t("teamDetail.notFound.title");
    document.title = `${title} — ${t("nav.siteTitle")}`;
  }, [team, t]);

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

  const formatRoles = (code: string) => {
    const { roles, substitute } = parsePosition(code);
    if (roles.length === 0) return substitute ? t("position.subOnly") : code;
    const words = roles.map((r) => t(ROLE_KEY[r])).join(" · ");
    return substitute ? (
      <>
        {words} <span className="position-sub">+ {t("position.sub")}</span>
      </>
    ) : (
      words
    );
  };

  const stats = summarize(team);
  const selectedSeason = team.seasons.find((s) => s.pairId === effectivePairId) ?? team.seasons[team.seasons.length - 1];

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
          <div className="chart-box rank">
            <RankLineChart
              categories={team.seasons.map((s) => s.season)}
              series={[{ ranks: team.seasons.map((s) => s.finalRank) }]}
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
          <div className="chart-box rank">
            <RankLineChart
              categories={selectedSeason.rankByGame.map((_, i) => i + 1)}
              series={[{ ranks: selectedSeason.rankByGame }]}
              xAxisName={t("chart.gamesPlayed")}
            />
          </div>
        </section>

        <section className="panel">
          <h2>{t("teamDetail.table.heading")}</h2>
          {/* tabIndex + role/aria-label make the scrollable region itself reachable
              and named for keyboard users -- axe's scrollable-region-focusable
              (serious, wcag2a/2.1.1/2.1.3) flags a scrolling div with neither. Same
              pattern as StandingsTable.tsx's .tableWrap. */}
          <div className="table-scroll-wrap" tabIndex={0} role="region" aria-label={t("teamDetail.table.scrollableRegion")}>
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
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t("teamDetail.players.heading")}</h2>
            <Select
              aria-label={t("teamDetail.players.sortLabel")}
              data-testid="team-players-sort"
              value={playerSort}
              onValueChange={(v) => setPlayerSort(v as PlayerSortKey)}
              options={PLAYER_SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            />
          </div>
          {playersData && playersData.excludedMidSeasonTransfers > 0 && (
            <p className="panel-framing">
              {t("teamDetail.players.excludedNote", { count: playersData.excludedMidSeasonTransfers })}
            </p>
          )}
          {!playersData ? (
            <p className="placeholder-note">{t("app.loadingPage")}</p>
          ) : sortedPlayers.length === 0 ? (
            <p className="placeholder-note" data-testid="team-players-empty">
              {t("teamDetail.players.empty")}
            </p>
          ) : (
            <div className="table-scroll-wrap" tabIndex={0} role="region" aria-label={t("teamDetail.players.scrollableRegion")}>
              <table className="method-results-table" data-testid="team-players-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: "left" }}>
                      {t("teamDetail.players.col.player")}
                    </th>
                    <th scope="col" style={{ textAlign: "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        {t("teamDetail.players.col.position")}
                        <InfoTooltip
                          aria-label={t("panelInfo.about", { panel: t("teamDetail.players.col.position") })}
                          data-testid="position-info"
                        >
                          {t("panelInfo.position")}
                        </InfoTooltip>
                      </span>
                    </th>
                    <th scope="col">{t("teamDetail.players.col.minutes")}</th>
                    <th scope="col">{t("teamDetail.players.col.goals")}</th>
                    <th scope="col">{t("teamDetail.players.col.xg")}</th>
                    <th scope="col">{t("teamDetail.players.col.assists")}</th>
                    <th scope="col">{t("teamDetail.players.col.xa")}</th>
                    <th scope="col">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        {t("teamDetail.players.col.xgChain")}
                        <InfoTooltip
                          aria-label={t("panelInfo.about", { panel: t("teamDetail.players.col.xgChain") })}
                          data-testid="xg-chain-info"
                        >
                          {t("panelInfo.xgChain")}
                        </InfoTooltip>
                      </span>
                    </th>
                    <th scope="col">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        {t("teamDetail.players.col.xgBuildup")}
                        <InfoTooltip
                          aria-label={t("panelInfo.about", { panel: t("teamDetail.players.col.xgBuildup") })}
                          data-testid="xg-buildup-info"
                        >
                          {t("panelInfo.xgBuildup")}
                        </InfoTooltip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p: PlayerOut) => (
                    <tr key={`${p.name}-${p.position}`}>
                      <th scope="row" style={{ textAlign: "left" }}>
                        {p.name}
                      </th>
                      <td style={{ textAlign: "left" }} data-position-code={p.position}>
                        {formatRoles(p.position)}
                      </td>
                      <td>{p.minutes}</td>
                      <td>{p.goals}</td>
                      <td>{p.xg.toFixed(2)}</td>
                      <td>{p.assists}</td>
                      <td>{p.xa.toFixed(2)}</td>
                      <td>{p.xgChain.toFixed(2)}</td>
                      <td>{p.xgBuildup.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
