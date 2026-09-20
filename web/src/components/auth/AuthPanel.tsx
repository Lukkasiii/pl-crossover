import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { DEMO_MODE } from "../../demo/mode";
import styles from "./AuthPanel.module.css";

type Tab = "login" | "register";

/**
 * Sits in the header, next to the season-pair picker. Never blocks anything
 * below it -- the dashboard is fully interactive whether this shows "Sign in"
 * or an email address, per CLAUDE.md Feature 4: login unlocks saving
 * scenarios and nothing else.
 */
export function AuthPanel() {
  const { user, loading, login, register, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (DEMO_MODE || loading) return null;

  if (user) {
    return (
      <div className={styles.panel}>
        <span className={styles.account}>{user.email}</span>
        <button type="button" onClick={() => logout()}>
          Sign out
        </button>
      </div>
    );
  }

  const closeAndReset = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (tab === "login") await login(email, password);
      else await register(email, password);
      closeAndReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Sign in
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Sign in">
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-pressed={tab === "login"}
              aria-selected={tab === "login"}
              onClick={() => setTab("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={tab === "register"}
              aria-selected={tab === "register"}
              onClick={() => setTab("register")}
            >
              Register
            </button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting}>
              {tab === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
