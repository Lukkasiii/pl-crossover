import type { TableRow } from "../ws/types";
import styles from "./StandingsTable.module.css";

interface StandingsTableProps {
  rows: TableRow[] | null;
}

export function StandingsTable({ rows }: StandingsTableProps) {
  if (rows === null) {
    return <p className={styles.placeholder}>Press play to start the replay.</p>;
  }

  return (
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
        {rows.map((row) => (
          <tr key={row.team_id} className={row.in_pair ? undefined : styles.excluded}>
            <td>{row.live_rank ?? "-"}</td>
            <td>{row.name}</td>
            <td>{row.games_played}</td>
            <td>{row.wins}</td>
            <td>{row.draws}</td>
            <td>{row.losses}</td>
            <td>{row.goal_diff}</td>
            <td>{row.points}</td>
            <td>{row.xgd.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
