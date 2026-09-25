import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { DEMO_MODE } from "../demo/mode";
import { lookupAsk } from "../demo/askFixtures";
import type { components } from "./schema";

export type AskOut = components["schemas"]["AskOut"];

async function fetchAskLive(questionId: string, lang: "en" | "zh"): Promise<AskOut> {
  const { data, error } = await api.POST("/api/ask", { body: { question_id: questionId, lang } });
  if (error) throw new Error("POST /api/ask failed");
  return data;
}

/**
 * Keyed by (questionId, lang) -- both cached-fixture branches (this hook's
 * DEMO_MODE path, and the live route's CachedAskSource) are pure lookups, so
 * asking the same question twice, or switching language and back, is a
 * cache hit with no request at all.
 */
export function useAsk(questionId: string | null, lang: "en" | "zh") {
  return useQuery<AskOut>({
    queryKey: ["ask", questionId, lang],
    queryFn: () => (DEMO_MODE ? lookupAsk(questionId!, lang) : fetchAskLive(questionId!, lang)),
    enabled: questionId !== null,
    staleTime: Infinity,
  });
}
