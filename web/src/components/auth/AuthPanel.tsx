import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { DEMO_MODE } from "../../demo/mode";
import { useLocale } from "../../i18n/LocaleContext";
import styles from "./AuthPanel.module.css";

type Tab = "login" | "register";

/**
 * Sits in the header, next to the season-pair picker. Never blocks anything
 * below it -- the dashboard is fully interactive whether this shows "Sign in"
 * or an email address, per CLAUDE.md Feature 4: login unlocks saving
 * scenarios and nothing else.
 */
export function AuthPanel() {
  const { t } = useLocale();
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
      <div className={`${styles.panel} sidebar-auth`}>
        <span className={styles.account} data-testid="account-email">
          {user.email}
        </span>
        <button type="button" onClick={() => logout()} data-testid="sign-out-button">
          {t("auth.signOut")}
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
      setError(err instanceof Error ? err.message : t("auth.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${styles.panel} sidebar-auth`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="sign-in-open-button"
      >
        {t("auth.signIn")}
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label={t("auth.signIn")} data-testid="auth-dialog">
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-pressed={tab === "login"}
              aria-selected={tab === "login"}
              onClick={() => setTab("login")}
              data-testid="auth-tab-login"
            >
              {t("auth.signIn")}
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={tab === "register"}
              aria-selected={tab === "register"}
              onClick={() => setTab("register")}
              data-testid="auth-tab-register"
            >
              {t("auth.register")}
            </button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            <label>
              {t("auth.email")}
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="auth-email-input"
              />
            </label>
            <label>
              {t("auth.password")}
              <input
                type="password"
                required
                minLength={8}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="auth-password-input"
              />
            </label>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} data-testid="auth-submit-button">
              {tab === "login" ? t("auth.signIn") : t("auth.createAccount")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
