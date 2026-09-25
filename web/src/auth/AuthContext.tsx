import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authBackend, type User } from "./backend";
import { subscribeAccessToken } from "./tokenStore";

interface AuthContextValue {
  user: User | null;
  /** True only while the mount-time session restore is in flight. */
  loading: boolean;
  /** false on the static demo, which signs in one built-in account and nothing else */
  canRegister: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The dashboard itself never depends on this -- replay, charts and the sigma
 * tuner all read from unauthenticated endpoints. This only gates saving
 * scenarios. Which account system sits behind it (the real API, or the
 * static demo's in-browser stand-in) is decided once, in backend.ts.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeAccessToken((token) => {
    if (token === null) setUser(null);
  }), []);

  useEffect(() => {
    let cancelled = false;
    authBackend
      .restore()
      .catch(() => null)
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await authBackend.login(email, password));
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setUser(await authBackend.register(email, password));
  }, []);

  const logout = useCallback(async () => {
    await authBackend.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, canRegister: authBackend.canRegister, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
