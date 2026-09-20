import { useMemo, useRef, useState } from "react";
import type { TableRow } from "../ws/types";
import { bandForRank, bandsForSeason } from "./zoneBands";
import { broadcastName } from "../teamNames";
import { useFlip } from "./useFlip";
import { useTweenedNumber } from "./useTweenedNumber";
import styles from "./StandingsTable.module.css";

interface StandingsTableProps {
  rows: TableRow[] | null;
  currentSeasonLabel: string;
}

function Points({ value }: { value: number }) {
  return <>{useTweenedNumber(value)}</>;
}

export function StandingsTable({ rows, currentSeasonLabel }: StandingsTableProps) {
  const bands = useMemo(() => bandsForSeason(currentSeasonLabel), [currentSeasonLabel]);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [hoveredTeamId, setHoveredTeamId] = useState<number | null>(null);

  // Called every render regardless of `rows` being null -- hooks can't be conditional.
  useFlip(
    rows?.map((r) => r.team_id) ?? [],
    (teamId) => rowRefs.current.get(teamId) ?? null,
  );

  if (rows === null) {
    return <p className={styles.placeholder}>Press play to start the replay.</p>;
  }

  return (
    <>
      {/* tabIndex + role/aria-label make the scrollable region itself reachable and
          named for keyboard users -- axe's scrollable-region-focusable (serious,
          wcag2a/2.1.1/2.1.3) flags a scrolling div with neither, since without them
          a keyboard-only user has no way to pan to the table's right-hand columns. */}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Standings table, scrollable">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">
                <abbr title="Games played">P</abbr>
              </th>
              <th scope="col">
                <abbr title="Wins">W</abbr>
              </th>
              <th scope="col">
                <abbr title="Draws">D</abbr>
              </th>
              <th scope="col">
                <abbr title="Losses">L</abbr>
              </th>
              <th scope="col">
                <abbr title="Goal difference">GD</abbr>
              </th>
              <th scope="col">
                <abbr title="Points">Pts</abbr>
              </th>
              <th scope="col">
                <abbr title="Expected goal difference">xGD</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const band = bandForRank(bands, row.live_rank);
              const isChampion = row.live_rank === 1;
              const ariaLabel = `${row.name}, ${row.live_rank ?? "unranked"}${band ? `, ${band.label}` : ""}${isChampion ? ", champions" : ""}${row.in_pair ? "" : ", outside the 17-team common sample"}`;
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
                  style={{ borderLeftColor: band?.color ?? "transparent" }}
                  aria-label={ariaLabel}
                  onMouseEnter={() => setHoveredTeamId(row.team_id)}
                  onMouseLeave={() => setHoveredTeamId((id) => (id === row.team_id ? null : id))}
                >
                  <td>
                    {isChampion && (
                      <span className={styles.championMark} aria-hidden="true">
                        &#127942;
                      </span>
                    )}
                    {row.live_rank ?? "-"}
                  </td>
                  <td className={styles.teamName}>{broadcastName(row.name)}</td>
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
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {bands.map((b) => (
          <li key={b.key}>
            <span className={styles.swatch} style={{ background: b.color }} />
            {b.label}
          </li>
        ))}
        <li>
          <span className={`${styles.swatch} ${styles.excludedSwatch}`} />
          Outside the 17-team common sample
        </li>
      </ul>
    </>
  );
}
