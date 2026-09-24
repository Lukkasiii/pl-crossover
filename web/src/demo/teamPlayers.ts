import type { TeamPlayersOut } from "../api/useTeamPlayers";

interface PairPlayers {
  excludedMidSeasonTransfers: number;
  teams: Record<string, TeamPlayersOut["players"]>;
}

const cache = new Map<number, Promise<PairPlayers>>();

/**
 * One file per season pair (players-<pairId>.json, ~110KB, every one of
 * that pair's 20 teams' squads) -- a team page only ever needs the pair
 * currently selected, so this fetches lazily per pairId and caches the
 * promise, the same granularity export_team_players.py bakes at.
 */
function loadPairPlayers(pairId: number): Promise<PairPlayers> {
  let promise = cache.get(pairId);
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}demo/players-${pairId}.json`).then((res) => {
      if (!res.ok) throw new Error(`demo/players-${pairId}.json: ${res.status}`);
      return res.json();
    });
    cache.set(pairId, promise);
  }
  return promise;
}

export async function lookupTeamPlayers(pairId: number, teamId: number): Promise<TeamPlayersOut> {
  const grid = await loadPairPlayers(pairId);
  return {
    players: grid.teams[String(teamId)] ?? [],
    excludedMidSeasonTransfers: grid.excludedMidSeasonTransfers,
  };
}
