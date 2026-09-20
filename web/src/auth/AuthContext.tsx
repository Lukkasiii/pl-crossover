import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { errorDetail } from "../api/errorDetail";
import { DEMO_MODE } from "../demo/mode";
import { setAccessToken, subscribeAccessToken } from "./tokenStore";
import type { components } from "../api/schema";

type User = components["schemas"]["UserOut"];

interface AuthContextValue {
  user: User | null;
  /** True only while the mount-time silent refresh is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The dashboard itself never depends on this -- replay, charts and the sigma
 * tuner all read from unauthenticated endpoints. This only gates saving
 * scenarios, so a component tree with no AuthProvider (there isn't one, but
 * hypothetically) would still show a working demo, just without a login box.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => subscribeAccessToken((token) => {
    if (token === null) setUser(null);
  }), []);

  useEffect(() => {
    // No backend behind the static demo build -- nothing to silently refresh.
    if (DEMO_MODE) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await api.POST("/auth/refresh");
      if (cancelled) return;
      if (!error) {
        setAccessToken(data.access_token);
        const me = await api.GET("/auth/me");
        if (!cancelled && !me.error) setUser(me.data);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await api.POST("/auth/login", { body: { email, password } });
    if (error) throw new Error(errorDetail(error, "incorrect email or password"));
    setAccessToken(data.access_token);
    const me = await api.GET("/auth/me");
    if (me.error) throw new Error("logged in but failed to load the account");
    setUser(me.data);
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      const { error } = await api.POST("/auth/register", { body: { email, password } });
      if (error) throw new Error(errorDetail(error, "registration failed"));
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await api.POST("/auth/logout");
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
