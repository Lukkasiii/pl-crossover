import { useEffect, useState } from "react";
import { api } from "./client";
import type { components } from "./schema";

type SeasonPair = components["schemas"]["SeasonPairOut"];

export function useSeasons() {
  const [pairs, setPairs] = useState<SeasonPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.GET("/api/seasons").then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError("failed to load seasons");
      else setPairs(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pairs, error };
}
