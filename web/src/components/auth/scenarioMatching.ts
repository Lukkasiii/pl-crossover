import type { ScenarioOut, ScenarioParams } from "../../auth/backend";

/**
 * A scenario *is* its four parameters -- the name is only a label on them.
 * Two scenarios with all four equal are the same setting saved twice.
 */
export function sameParams(a: ScenarioParams, b: ScenarioParams): boolean {
  return (
    a.metric === b.metric &&
    a.method === b.method &&
    a.prior_weight === b.prior_weight &&
    a.obs_variance === b.obs_variance
  );
}

/** Every saved scenario whose parameters equal `params`. */
export function scenariosWithParams(list: readonly ScenarioOut[], params: ScenarioParams): ScenarioOut[] {
  return list.filter((s) => sameParams(s.params, params));
}

/**
 * The scenario already using `name`, other than `exceptId` (the one being
 * renamed). Exact match after trimming, the same rule as the database's
 * UNIQUE (user_id, name) -- so the client never lets through a name the
 * server would refuse, or refuses one it would take.
 */
export function scenarioNamed(list: readonly ScenarioOut[], name: string, exceptId?: number): ScenarioOut | undefined {
  const wanted = name.trim();
  return list.find((s) => s.id !== exceptId && s.name === wanted);
}
