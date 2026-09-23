import { useEffect, useState } from "react";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import type { components } from "./schema";

export type TeamOut = components["schemas"]["TeamOut"];
export type TeamSeasonOut = components["schemas"]["TeamSeasonOut"];

async function fetchTeamSeasons(): Promise<TeamOut[]> {
  if (DEMO_MODE) {
    const res = await fetch(`${import.meta.env.BASE_URL}demo/team-seasons.json`);
    if (!res.ok) throw new Error(`demo/team-seasons.json: ${res.status}`);
    const body = (await res.json()) as components["schemas"]["TeamSeasonsOut"];
    return body.teams;
  }
  const { data, error } = await api.GET("/api/team-seasons");
  if (error) throw new Error("GET /api/team-seasons failed");
  return data.teams;
}

/**
 * Fetched lazily, only by the routes that need it (/teams, /teams/:slug,
 * /compare) -- see CLAUDE.md "Shared data export": / and /season must not
 * pay for this file just because it exists.
 */
export function useTeamSeasons() {
  const [teams, setTeams] = useState<TeamOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeamSeasons()
      .then((data) => {
        if (!cancelled) setTeams(data);
      })
      .catch(() => {
        if (!cancelled) setError("failed to load team history");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { teams, error };
}
