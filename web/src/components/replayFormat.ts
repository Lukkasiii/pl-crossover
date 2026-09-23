import type { TableRow } from "../ws/types";

/** Total league fixtures for a 20-team double round-robin season -- always 380, independent of postponements. */
export const TOTAL_MATCHES = 380;

/**
 * Postponements put teams out of step (see CLAUDE.md "Index by games played,
 * not matchweek"), so "games played by this point" is a range, not a single
 * number, whenever the table's started teams haven't all kicked off the same
 * number of times.
 */
export function gamesPlayedRange(table: TableRow[] | null): [number, number] | null {
  if (!table) return null;
  const started = table.filter((r) => r.games_played > 0).map((r) => r.games_played);
  if (started.length === 0) return null;
  return [Math.min(...started), Math.max(...started)];
}
