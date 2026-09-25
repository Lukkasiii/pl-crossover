import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { DEMO_EMAIL, DEMO_PASSWORD, DemoAuthError } from "../../auth/browserBackend";
import { useLocale } from "../../i18n/LocaleContext";
import styles from "./AuthPanel.module.css";

type Tab = "login" | "register";

/**
 * The sign-in / register form, shared by the sidebar popover and the
 * signed-out /scenarios page. When the backend can only sign in its one
 * built-in account (the static demo), the form says so before anything
 * else, prints that account's credentials, arrives pre-filled with them,
 * and has no register tab -- nothing here may read as a real account
 * system when it isn't one.
 */
export function SignInForm({ onSignedIn, idPrefix }: { onSignedIn?: () => void; idPrefix: string }) {
  const { t } = useLocale();
  const { canRegister, login, register } = useAuth();
  const demo = !canRegister;
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (tab === "login") await login(email, password);
      else await register(email, password);
      setPassword("");
      onSignedIn?.();
    } catch (err) {
      if (err instanceof DemoAuthError) setError(t(err.i18nKey));
      else setError(err instanceof Error ? err.message : t("auth.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  const noticeId = `${idPrefix}-demo-notice`;

  return (
    <>
      {demo && (
        <div className={styles.demoNotice} id={noticeId} data-testid="auth-demo-notice">
          <p className={styles.demoNoticeTitle}>{t("auth.demo.title")}</p>
          <dl className={styles.demoCredentials}>
            <dt>{t("auth.email")}</dt>
            <dd data-testid="auth-demo-email">{DEMO_EMAIL}</dd>
            <dt>{t("auth.password")}</dt>
            <dd data-testid="auth-demo-password">{DEMO_PASSWORD}</dd>
          </dl>
          <p>{t("auth.demo.body")}</p>
        </div>
      )}

      {canRegister && (
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            onClick={() => setTab("login")}
            data-testid="auth-tab-login"
          >
            {t("auth.signIn")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            onClick={() => setTab("register")}
            data-testid="auth-tab-register"
          >
            {t("auth.register")}
          </button>
        </div>
      )}

      <form className={styles.form} onSubmit={submit} aria-describedby={demo ? noticeId : undefined}>
        <label>
          {t("auth.email")}
          <input
            type="email"
            required
            // The demo account isn't worth a password manager's offer to save it.
            autoComplete={demo ? "off" : "email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="auth-email-input"
          />
        </label>
        <label>
          {t("auth.password")}
          <input
            type={demo ? "text" : "password"}
            required
            minLength={8}
            autoComplete={demo ? "off" : tab === "login" ? "current-password" : "new-password"}
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
    </>
  );
}
