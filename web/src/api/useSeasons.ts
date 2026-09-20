import { useEffect, useState } from "react";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import type { components } from "./schema";

type SeasonPair = components["schemas"]["SeasonPairOut"];

async function fetchSeasons(): Promise<SeasonPair[]> {
  if (DEMO_MODE) {
    const res = await fetch(`${import.meta.env.BASE_URL}demo/seasons.json`);
    if (!res.ok) throw new Error(`demo/seasons.json: ${res.status}`);
    return res.json();
  }
  const { data, error } = await api.GET("/api/seasons");
  if (error) throw new Error("GET /api/seasons failed");
  return data;
}

export function useSeasons() {
  const [pairs, setPairs] = useState<SeasonPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSeasons()
      .then((data) => {
        if (!cancelled) setPairs(data);
      })
      .catch(() => {
        if (!cancelled) setError("failed to load seasons");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pairs, error };
}
