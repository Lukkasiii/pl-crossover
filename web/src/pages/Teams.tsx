import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { useTeamSeasons, type TeamOut } from "../api/useTeamSeasons";
import { SearchInput } from "../components/ui/SearchInput";
import { Select } from "../components/ui/Select";
import { broadcastName } from "../teamNames";
import styles from "./Teams.module.css";

type SortKey = "name" | "seasons" | "bestRank" | "points";

export interface TeamStats {
  seasonsPlayed: number;
  bestRank: number;
  worstRank: number;
  meanPoints: number;
}

/** Shared with TeamDetail's header, which needs the same best/worst/mean shape for one team. */
export function summarize(team: TeamOut): TeamStats {
  const finalRanks = team.seasons.map((s) => s.finalRank);
  const meanPoints = team.seasons.reduce((sum, s) => sum + s.points, 0) / team.seasons.length;
  return {
    seasonsPlayed: team.seasons.length,
    bestRank: Math.min(...finalRanks),
    worstRank: Math.max(...finalRanks),
    meanPoints: Math.round(meanPoints * 10) / 10,
  };
}

function sortRows(rows: { team: TeamOut; stats: TeamStats }[], sort: SortKey) {
  const sorted = [...rows];
  switch (sort) {
    case "seasons":
      sorted.sort((a, b) => b.stats.seasonsPlayed - a.stats.seasonsPlayed || a.team.name.localeCompare(b.team.name));
      break;
    case "bestRank":
      sorted.sort((a, b) => a.stats.bestRank - b.stats.bestRank || a.team.name.localeCompare(b.team.name));
      break;
    case "points":
      sorted.sort((a, b) => b.stats.meanPoints - a.stats.meanPoints || a.team.name.localeCompare(b.team.name));
      break;
    default:
      sorted.sort((a, b) => a.team.name.localeCompare(b.team.name));
  }
  return sorted;
}

export default function Teams() {
  const { t, formatNumber } = useLocale();
  const { teams, error } = useTeamSeasons();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  useEffect(() => {
    document.title = `${t("nav.teams")} — ${t("nav.siteTitle")}`;
  }, [t]);

  const rows = useMemo(() => {
    if (!teams) return null;
    const withStats = teams.map((team) => ({ team, stats: summarize(team) }));
    const q = query.toLowerCase();
    const filtered = q
      ? withStats.filter(
          ({ team }) => team.name.toLowerCase().includes(q) || broadcastName(team.name).toLowerCase().includes(q),
        )
      : withStats;
    return sortRows(filtered, sort);
  }, [teams, query, sort]);

  return (
    <div data-testid="page-teams">
      <header className="app-header">
        <h1>{t("nav.teams")}</h1>
        <p className="subtitle">{t("teams.subtitle")}</p>
      </header>

      {error && <p className="placeholder-note">{t("teams.failedToLoad")}</p>}
      {!teams && !error && <p className="placeholder-note">{t("app.loadingPage")}</p>}

      {rows && (
        <>
          <div className={styles.toolbar}>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("teams.searchPlaceholder")}
              aria-label={t("teams.searchLabel")}
              clearAriaLabel={t("standings.searchClear")}
              data-testid="teams-search"
            />
            <Select
              aria-label={t("teams.sortLabel")}
              data-testid="teams-sort"
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
              options={[
                { value: "name", label: t("teams.sort.name") },
                { value: "seasons", label: t("teams.sort.seasons") },
                { value: "bestRank", label: t("teams.sort.bestRank") },
                { value: "points", label: t("teams.sort.points") },
              ]}
            />
          </div>

          {rows.length === 0 ? (
            <p className={styles.empty} data-testid="teams-empty">
              {t("teams.searchEmpty", { query })}
            </p>
          ) : (
            <div className={styles.grid} data-testid="teams-grid">
              {rows.map(({ team, stats }) => (
                <Link key={team.id} to={`/teams/${team.slug}`} className={styles.card} data-testid={`team-card-${team.slug}`}>
                  <h2 className={styles.cardName}>{broadcastName(team.name)}</h2>
                  <dl className={styles.cardStats}>
                    <div>
                      <dt>{t("teams.card.seasons")}</dt>
                      <dd>{stats.seasonsPlayed}</dd>
                    </div>
                    <div>
                      <dt>{t("teams.card.bestRank")}</dt>
                      <dd>#{stats.bestRank}</dd>
                    </div>
                    <div>
                      <dt>{t("teams.card.worstRank")}</dt>
                      <dd>#{stats.worstRank}</dd>
                    </div>
                    <div>
                      <dt>{t("teams.card.meanPoints")}</dt>
                      <dd>{formatNumber(stats.meanPoints)}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
