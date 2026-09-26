import { describe, expect, it } from "vitest";
import { preKickoffTable } from "./preKickoff";
import type { TableRow } from "./types";

const row = (team_id: number, name: string, extra: Partial<TableRow> = {}): TableRow => ({
  team_id,
  name,
  games_played: 1,
  wins: 1,
  draws: 0,
  losses: 0,
  goals_for: 4,
  goals_against: 3,
  goal_diff: 1,
  points: 3,
  xg: 1.8,
  xga: 1.1,
  xgd: 0.7,
  live_rank: 1,
  in_pair: true,
  final_rank: 5,
  ...extra,
});

describe("preKickoffTable", () => {
  it("keeps every club, zeroes every count, and ranks nobody", () => {
    const first = [row(1, "Leicester"), row(2, "Arsenal", { in_pair: false, live_rank: 2 }), row(3, "Watford", { games_played: 0, live_rank: null })];
    const table = preKickoffTable(first);
    expect(table.map((r) => r.name)).toEqual(["Arsenal", "Leicester", "Watford"]);
    for (const r of table) {
      expect([r.games_played, r.wins, r.draws, r.losses, r.goals_for, r.goals_against, r.goal_diff, r.points]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect([r.xg, r.xga, r.xgd]).toEqual([0, 0, 0]);
      expect(r.live_rank).toBeNull();
    }
    // Sample membership is a fact about the club, not the scoreline -- it survives.
    expect(table.find((r) => r.name === "Arsenal")?.in_pair).toBe(false);
  });

  it("doesn't mutate the frame it was built from", () => {
    const first = [row(1, "Leicester")];
    preKickoffTable(first);
    expect(first[0].points).toBe(3);
  });
});
