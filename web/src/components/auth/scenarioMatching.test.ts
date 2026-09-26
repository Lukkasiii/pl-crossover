import { describe, expect, it } from "vitest";
import { sameParams, scenarioNamed, scenariosWithParams } from "./scenarioMatching";
import type { ScenarioOut, ScenarioParams } from "../../auth/backend";

const params = (over: Partial<ScenarioParams> = {}): ScenarioParams => ({
  metric: "points",
  method: "pooled",
  prior_weight: 5,
  obs_variance: 1.5,
  ...over,
});
const scenario = (id: number, name: string, p: ScenarioParams): ScenarioOut => ({
  id,
  name,
  params: p,
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
});

describe("sameParams", () => {
  it("needs all four fields equal", () => {
    expect(sameParams(params(), params())).toBe(true);
    expect(sameParams(params(), params({ metric: "xg" }))).toBe(false);
    expect(sameParams(params(), params({ method: "per_season" }))).toBe(false);
    expect(sameParams(params(), params({ prior_weight: 6 }))).toBe(false);
    expect(sameParams(params(), params({ obs_variance: 2 }))).toBe(false);
  });
});

describe("scenariosWithParams", () => {
  it("finds every scenario already holding these settings", () => {
    const list = [scenario(1, "a", params()), scenario(2, "b", params({ prior_weight: 8 })), scenario(3, "c", params())];
    expect(scenariosWithParams(list, params()).map((s) => s.name)).toEqual(["a", "c"]);
  });
});

describe("scenarioNamed", () => {
  const list = [scenario(1, "Aggressive prior", params()), scenario(2, "baseline", params())];

  it("matches the exact trimmed name, like the database's UNIQUE constraint", () => {
    expect(scenarioNamed(list, "  baseline ")?.id).toBe(2);
    expect(scenarioNamed(list, "Baseline")).toBeUndefined();
  });

  it("ignores the scenario being renamed", () => {
    expect(scenarioNamed(list, "baseline", 2)).toBeUndefined();
    expect(scenarioNamed(list, "baseline", 1)?.id).toBe(2);
  });
});
