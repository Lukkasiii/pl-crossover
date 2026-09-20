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
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
            <th>xGD</th>
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
