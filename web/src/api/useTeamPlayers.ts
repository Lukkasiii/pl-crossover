import { useEffect, useState } from "react";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import { lookupTeamPlayers } from "../demo/teamPlayers";
import type { components } from "./schema";

export type PlayerOut = components["schemas"]["PlayerOut"];
export type TeamPlayersOut = components["schemas"]["TeamPlayersOut"];

async function fetchTeamPlayersLive(pairId: number, teamId: number): Promise<TeamPlayersOut> {
  const { data, error } = await api.GET("/api/team-players", { params: { query: { pair_id: pairId, team_id: teamId } } });
  if (error) throw new Error("GET /api/team-players failed");
  return data;
}

function keyFor(pairId: number | null, teamId: number | null): string | null {
  return pairId === null || teamId === null ? null : `${pairId}:${teamId}`;
}

/**
 * One team's squad for one season pair's current season -- see
 * api/app/players.py. Tags each resolved result with the (pairId, teamId)
 * it answers, the same pattern usePairCurve uses, so switching season on
 * TeamDetail never briefly shows the previous season's squad under the new
 * season's heading while the new fetch is in flight.
 */
export function useTeamPlayers(pairId: number | null, teamId: number | null) {
  const [result, setResult] = useState<{ key: string; data: TeamPlayersOut } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pairId === null || teamId === null) return;
    let cancelled = false;
    const key = keyFor(pairId, teamId)!;
    (DEMO_MODE ? lookupTeamPlayers(pairId, teamId) : fetchTeamPlayersLive(pairId, teamId))
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch(() => {
        if (!cancelled) setError("failed to load players");
      });
    return () => {
      cancelled = true;
    };
  }, [pairId, teamId]);

  const data = result?.key === keyFor(pairId, teamId) ? result.data : null;
  return { data, error };
}
