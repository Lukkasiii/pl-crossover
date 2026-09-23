import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { TableRow } from "../ws/types";
import { bandForRank, bandsForSeason, type ZoneBand } from "./zoneBands";
import { broadcastName, teamSlug } from "../teamNames";
import { useFlip } from "./useFlip";
import { useTweenedNumber } from "./useTweenedNumber";
import { useLocale } from "../i18n/LocaleContext";
import { useUrlParamWriter } from "../routing/useUrlParamWriter";
import { Select } from "./ui/Select";
import styles from "./StandingsTable.module.css";

interface StandingsTableProps {
  rows: TableRow[] | null;
  currentSeasonLabel: string;
}

function Points({ value }: { value: number }) {
  return <>{useTweenedNumber(value)}</>;
}

function HeaderAbbr({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <button type="button" className={styles.headerAbbrTrigger}>
          <abbr title={label}>{children}</abbr>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tooltip} sideOffset={4} updatePositionStrategy="always">
          {label}
          <Tooltip.Arrow className={styles.tooltipArrow} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type SampleFilter = "" | "in" | "out";

function matchesSample(row: TableRow, sample: SampleFilter): boolean {
  if (sample === "in") return row.in_pair;
  if (sample === "out") return !row.in_pair;
  return true;
}

function matchesQuery(row: TableRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return row.name.toLowerCase().includes(q) || broadcastName(row.name).toLowerCase().includes(q);
}

export function StandingsTable({ rows, currentSeasonLabel }: StandingsTableProps) {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const writeUrlParam = useUrlParamWriter();
  const bands = useMemo(() => bandsForSeason(currentSeasonLabel), [currentSeasonLabel]);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [hoveredTeamId, setHoveredTeamId] = useState<number | null>(null);

  // Local state drives the input immediately (typing shouldn't wait on a
  // route re-render); the URL is a side-channel so the filtered view is
  // shareable, not the source of truth for what's on screen right now.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const zoneFilter = searchParams.get("zone") ?? "";
  const sampleFilter = (searchParams.get("sample") ?? "") as SampleFilter;

  const setQueryUrl = (next: string) => writeUrlParam((p) => (next ? p.set("q", next) : p.delete("q")));
  const setZoneUrl = (next: string) => writeUrlParam((p) => (next ? p.set("zone", next) : p.delete("zone")));
  const setSampleUrl = (next: string) => writeUrlParam((p) => (next ? p.set("sample", next) : p.delete("sample")));

  const visibleRows = useMemo(() => {
    if (rows === null) return null;
    return rows.filter((row) => {
      const band = bandForRank(bands, row.live_rank);
      if (zoneFilter && band?.key !== zoneFilter) return false;
      if (!matchesSample(row, sampleFilter)) return false;
      return matchesQuery(row, query);
    });
  }, [rows, bands, zoneFilter, sampleFilter, query]);

  // Called every render regardless of `rows` being null -- hooks can't be conditional.
  useFlip(
    visibleRows?.map((r) => r.team_id) ?? [],
    (teamId) => rowRefs.current.get(teamId) ?? null,
  );

  if (rows === null) {
    return <p className={styles.placeholder}>{t("standings.pressPlay")}</p>;
  }

  const zoneOptions = [
    { value: "", label: t("standings.filterZoneAll") },
    ...bands.map((b) => ({ value: b.key, label: t(b.labelKey) })),
  ];
  const sampleOptions = [
    { value: "", label: t("standings.filterSampleAll") },
    { value: "in", label: t("standings.filterSampleIn") },
    { value: "out", label: t("standings.filterSampleOut") },
  ];

  return (
    <Tooltip.Provider>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            data-testid="standings-search"
            aria-label={t("standings.searchLabel")}
            placeholder={t("standings.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setQueryUrl(e.target.value);
            }}
          />
          {query && (
            <button
              type="button"
              className={styles.searchClear}
              aria-label={t("standings.searchClear")}
              data-testid="standings-search-clear"
              onClick={() => {
                setQuery("");
                setQueryUrl("");
              }}
            >
              ✕
            </button>
          )}
        </div>
        <Select
          aria-label={t("standings.filterZoneLabel")}
          data-testid="standings-zone-filter"
          value={zoneFilter}
          onValueChange={setZoneUrl}
          options={zoneOptions}
        />
        <Select
          aria-label={t("standings.filterSampleLabel")}
          data-testid="standings-sample-filter"
          value={sampleFilter}
          onValueChange={setSampleUrl}
          options={sampleOptions}
        />
      </div>

      {/* tabIndex + role/aria-label make the scrollable region itself reachable and
          named for keyboard users -- axe's scrollable-region-focusable (serious,
          wcag2a/2.1.1/2.1.3) flags a scrolling div with neither, since without them
          a keyboard-only user has no way to pan to the table's right-hand columns. */}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={t("standings.scrollableRegion")}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("standings.col.team")}</th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.played")}>P</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.wins")}>W</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.draws")}>D</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.losses")}>L</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.goalDiff")}>GD</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.points")}>Pts</HeaderAbbr>
              </th>
              <th scope="col">
                <HeaderAbbr label={t("standings.col.xgd")}>xGD</HeaderAbbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows?.map((row) => {
              const band = bandForRank(bands, row.live_rank);
              const isChampion = row.live_rank === 1;
              const ariaLabel = `${row.name}, ${row.live_rank ?? t("standings.unranked")}${band ? `, ${t(band.labelKey)}` : ""}${isChampion ? `, ${t("standings.champions")}` : ""}${row.in_pair ? "" : `, ${t("standings.outsideSample")}`}`;
              return (
                <tr
                  key={row.team_id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.team_id, el);
                    else rowRefs.current.delete(row.team_id);
                  }}
                  className={[row.in_pair ? "" : styles.excluded, row.team_id === hoveredTeamId ? styles.hovered : ""]
                    .filter(Boolean)
                    .join(" ")}
                  style={bandStyle(band)}
                  aria-label={ariaLabel}
                  onMouseEnter={() => setHoveredTeamId(row.team_id)}
                  onMouseLeave={() => setHoveredTeamId((id) => (id === row.team_id ? null : id))}
                >
                  {/* The border lives on the first cell, not the <tr> -- a border set
                      directly on a table row doesn't reliably paint in every engine
                      under border-collapse: collapse (Safari in particular), while a
                      cell border always does. */}
                  <td style={band ? { borderLeft: `3px solid ${band.border}` } : undefined}>
                    {isChampion && (
                      <span className={styles.championMark} aria-hidden="true">
                        &#127942;
                      </span>
                    )}
                    {row.live_rank ?? "-"}
                  </td>
                  <td className={styles.teamName}>
                    <Link to={`/teams/${teamSlug(row.name)}`}>{broadcastName(row.name)}</Link>
                  </td>
                  <td>{row.games_played}</td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goal_diff}</td>
                  <td>
                    <Points value={row.points} />
                  </td>
                  <td>{row.xgd.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRows?.length === 0 && (
          <p className={styles.searchEmpty} data-testid="standings-empty">
            {t("standings.searchEmpty", { query })}
          </p>
        )}
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {bands.map((b) => (
          <li key={b.key}>
            <span className={styles.swatch} style={{ background: b.border }} />
            {t(b.labelKey)}
          </li>
        ))}
        <li>
          <span className={`${styles.swatch} ${styles.excludedSwatch}`} />
          {t("standings.legend.outsideSample")}
        </li>
      </ul>
    </Tooltip.Provider>
  );
}

/**
 * The full-row tint -- an exact hex per band (see index.css's --zone-*-bg
 * tokens), not colour-mixed, so ink primary's contrast against it is the
 * designed >= 14:1 rather than whatever a runtime blend happens to land on.
 * The border half of the band lives on the first cell (see the row map
 * below), not here.
 */
function bandStyle(band: ZoneBand | null): React.CSSProperties | undefined {
  if (!band) return undefined;
  return { background: band.bg };
}
