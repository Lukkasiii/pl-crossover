import type { AskOut } from "../api/useAsk";

interface AskFixture {
  id: string;
  question_en: string;
  question_zh: string;
  answer_en: string;
  answer_zh: string;
  tool_calls: AskOut["toolCalls"];
}

/**
 * `/api/ask` is already a pure lookup from `ask_fixtures.json` (see
 * api/app/ask.py's CachedAskSource) -- no live DB query, no model call, for
 * every deployment of this demo, not just the static one. So the static
 * demo doesn't need its own baked grid the way usePredict/usePooledCurve do;
 * scripts/export_ask_fixtures.py just copies the same committed file to
 * web/public/demo/ask-fixtures.json, and this picks the requested locale out
 * of it the same way the live route does server-side.
 */
let fixturesPromise: Promise<AskFixture[]> | null = null;

function loadFixtures(): Promise<AskFixture[]> {
  if (!fixturesPromise) {
    fixturesPromise = fetch(`${import.meta.env.BASE_URL}demo/ask-fixtures.json`).then((res) => {
      if (!res.ok) throw new Error(`demo/ask-fixtures.json: ${res.status}`);
      return res.json();
    });
  }
  return fixturesPromise;
}

export async function lookupAsk(questionId: string, lang: "en" | "zh"): Promise<AskOut> {
  const fixtures = await loadFixtures();
  const fixture = fixtures.find((f) => f.id === questionId);
  if (!fixture) throw new Error(`demo has no ask fixture for question_id=${questionId}`);
  return {
    id: fixture.id,
    question: lang === "en" ? fixture.question_en : fixture.question_zh,
    answer: lang === "en" ? fixture.answer_en : fixture.answer_zh,
    toolCalls: fixture.tool_calls,
  };
}
