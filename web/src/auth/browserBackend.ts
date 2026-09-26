import type { TranslationKey } from "../i18n/dictionaries";
import type { AuthBackend, ScenarioOut, User } from "./backend";

/**
 * The static demo's stand-in for the account system. There is no server
 * behind GitHub Pages, so this "signs in" one seeded demo account and keeps
 * its scenarios in localStorage. It is not an account system and doesn't
 * pretend to be: no registration, no other accounts, nothing stored but the
 * demo user's own scenarios, and the sign-in panel says all of this in
 * words (auth.demoNotice). The same credentials the backend's seed script
 * creates (scripts/seed_demo_account.py), so one pair works everywhere.
 */
export const DEMO_EMAIL = "demo@plcrossover.dev";
export const DEMO_PASSWORD = "crossover-demo";
const DEMO_USER: User = { id: 1, email: DEMO_EMAIL };

/** Carries a dictionary key so the sign-in panel can say it in the visitor's language. */
export class DemoAuthError extends Error {
  readonly i18nKey: TranslationKey;

  constructor(i18nKey: TranslationKey) {
    super(i18nKey);
    this.i18nKey = i18nKey;
  }
}

const SESSION_KEY = "pl-crossover:demo-session";
const scenariosKey = (userId: number) => `pl-crossover:demo-scenarios:${userId}`;

// localStorage throws outright in some private windows and when storage is
// blocked; every access goes through these, and a failure falls back to an
// in-memory copy so the demo still works for the life of the tab.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // fall through to the in-memory copy
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // the in-memory copy above is all there is this session
  }
}

function loadScenarios(): ScenarioOut[] {
  const raw = read(scenariosKey(DEMO_USER.id));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScenarioOut[]) : [];
  } catch {
    return [];
  }
}

function saveScenarios(list: ScenarioOut[]): void {
  write(scenariosKey(DEMO_USER.id), JSON.stringify(list));
}

function requireSession(): void {
  if (read(SESSION_KEY) !== DEMO_EMAIL) throw new DemoAuthError("auth.demo.signInFirst");
}

export const browserBackend: AuthBackend = {
  canRegister: false,

  async restore() {
    return read(SESSION_KEY) === DEMO_EMAIL ? DEMO_USER : null;
  },

  async login(email, password) {
    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      throw new DemoAuthError("auth.demo.wrongCredentials");
    }
    write(SESSION_KEY, DEMO_EMAIL);
    return DEMO_USER;
  },

  async register() {
    throw new DemoAuthError("auth.demo.noRegistration");
  },

  async logout() {
    write(SESSION_KEY, null);
  },

  async listScenarios() {
    requireSession();
    // Most recently touched first -- the same ORDER BY updated_at DESC the
    // real endpoint uses (api/app/routers/scenarios.py).
    return loadScenarios().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async createScenario(name, params) {
    requireSession();
    const list = loadScenarios();
    // Same rule as the real database's UNIQUE (user_id, name).
    if (list.some((s) => s.name === name)) throw new DemoAuthError("auth.demo.nameTaken");
    const now = new Date().toISOString();
    const scenario: ScenarioOut = {
      id: list.reduce((max, s) => Math.max(max, s.id), 0) + 1,
      name,
      params,
      created_at: now,
      updated_at: now,
    };
    saveScenarios([scenario, ...list]);
    return scenario;
  },

  async renameScenario(id, name) {
    requireSession();
    const list = loadScenarios();
    const existing = list.find((s) => s.id === id);
    if (!existing) throw new DemoAuthError("auth.demo.scenarioGone");
    if (list.some((s) => s.id !== id && s.name === name)) throw new DemoAuthError("auth.demo.nameTaken");
    const renamed = { ...existing, name, updated_at: new Date().toISOString() };
    saveScenarios(list.map((s) => (s.id === id ? renamed : s)));
    return renamed;
  },

  async deleteScenario(id) {
    requireSession();
    saveScenarios(loadScenarios().filter((s) => s.id !== id));
  },
};
