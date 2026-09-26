import type { TableRow } from "./types";

/**
 * The table before a ball is kicked: every club in the season, every count
 * at zero, nobody ranked. Built from the first match frame's roster rather
 * than streamed as a frame of its own -- the stream's 418 frames are
 * published figures, and "nothing has happened yet" isn't a frame, it's the
 * state before the first one. Alphabetical, since there is no table order
 * yet to sort by.
 */
export function preKickoffTable(firstFrameTable: readonly TableRow[]): TableRow[] {
  return firstFrameTable
    .map((row) => ({
      ...row,
      games_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 0,
      xg: 0,
      xga: 0,
      xgd: 0,
      live_rank: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
