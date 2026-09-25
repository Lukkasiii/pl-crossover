import { DEMO_MODE } from "../demo/mode";
import type { components } from "../api/schema";
import { apiBackend } from "./apiBackend";
import { browserBackend } from "./browserBackend";

export type User = components["schemas"]["UserOut"];
export type ScenarioParams = components["schemas"]["ScenarioParams"];
export type ScenarioOut = components["schemas"]["ScenarioOut"];

/**
 * Everything the UI needs from an account system, and nothing about how
 * it's done. Two implementations: `apiBackend` (the real one -- bcrypt,
 * JWT, access token in memory, refresh token in an httpOnly cookie, see
 * api/app/security.py and api/app/routers/auth.py) and `browserBackend`
 * (the static demo's stand-in, which has no server to talk to). Same
 * shape as the Ask panel's live/cached split: callers never branch.
 */
export interface AuthBackend {
  /** false when the backend can only sign in its one seeded account */
  canRegister: boolean;
  /** Restores a session that outlived a page load, if there is one. */
  restore(): Promise<User | null>;
  login(email: string, password: string): Promise<User>;
  register(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  listScenarios(): Promise<ScenarioOut[]>;
  createScenario(name: string, params: ScenarioParams): Promise<ScenarioOut>;
  renameScenario(id: number, name: string): Promise<ScenarioOut>;
  deleteScenario(id: number): Promise<void>;
}

/** The one place the choice is made -- a build-time constant, like every other DEMO_MODE split. */
export const authBackend: AuthBackend = DEMO_MODE ? browserBackend : apiBackend;
