import { api } from "../api/client";
import { errorDetail } from "../api/errorDetail";
import { setAccessToken } from "./tokenStore";
import type { AuthBackend, User } from "./backend";

async function loadMe(): Promise<User> {
  const me = await api.GET("/auth/me");
  if (me.error) throw new Error("logged in but failed to load the account");
  return me.data;
}

async function login(email: string, password: string): Promise<User> {
  const { data, error } = await api.POST("/auth/login", { body: { email, password } });
  if (error) throw new Error(errorDetail(error, "incorrect email or password"));
  setAccessToken(data.access_token);
  return loadMe();
}

/** The real account system, over the FastAPI backend. */
export const apiBackend: AuthBackend = {
  canRegister: true,

  async restore() {
    const { data, error } = await api.POST("/auth/refresh");
    if (error) return null;
    setAccessToken(data.access_token);
    try {
      return await loadMe();
    } catch {
      return null;
    }
  },

  login,

  async register(email, password) {
    const { error } = await api.POST("/auth/register", { body: { email, password } });
    if (error) throw new Error(errorDetail(error, "registration failed"));
    return login(email, password);
  },

  async logout() {
    await api.POST("/auth/logout");
    setAccessToken(null);
  },

  async listScenarios() {
    const { data, error } = await api.GET("/api/scenarios");
    if (error) throw new Error(errorDetail(error, "failed to load scenarios"));
    return data;
  },

  async createScenario(name, params) {
    const { data, error } = await api.POST("/api/scenarios", { body: { name, params } });
    if (error) throw new Error(errorDetail(error, "failed to save scenario"));
    return data;
  },

  async renameScenario(id, name) {
    const { data, error } = await api.PUT("/api/scenarios/{scenario_id}", {
      params: { path: { scenario_id: id } },
      body: { name },
    });
    if (error) throw new Error(errorDetail(error, "failed to rename scenario"));
    return data;
  },

  async deleteScenario(id) {
    const { error } = await api.DELETE("/api/scenarios/{scenario_id}", {
      params: { path: { scenario_id: id } },
    });
    if (error) throw new Error(errorDetail(error, "failed to delete scenario"));
  },
};
