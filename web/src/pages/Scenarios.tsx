import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { ScenariosPanel } from "../components/auth/ScenariosPanel";
import { SignInForm } from "../components/auth/SignInForm";
import { useLocale } from "../i18n/LocaleContext";
import { useReplayParams } from "../state/ReplayParamsContext";

/**
 * Auth-gated for *saving*, not for viewing -- same rule as pre-v2
 * (CLAUDE.md Feature 4): signed out shows the sign-in form inline, never a
 * redirect wall -- a sidebar entry that led to one sentence and nothing to
 * do with it was worse than no entry at all. "Current" params to save come from ReplayParamsContext,
 * shared with /season, so tuning the dashboard there and saving here work
 * across the route split exactly like they did in one page.
 */
export default function Scenarios() {
  const { t } = useLocale();
  const { user, loading } = useAuth();
  const { currentScenarioParams, loadScenario } = useReplayParams();

  useEffect(() => {
    document.title = `${t("nav.scenarios")} — ${t("nav.siteTitle")}`;
  }, [t]);

  return (
    <div data-testid="page-scenarios">
      <header className="app-header">
        <h1>{t("nav.scenarios")}</h1>
      </header>

      {loading ? (
        <p className="placeholder-note">{t("app.loadingPage")}</p>
      ) : user ? (
        <ScenariosPanel current={currentScenarioParams} onLoad={loadScenario} />
      ) : (
        <section className="panel scenarios-sign-in" data-testid="scenarios-sign-in-prompt">
          <h2>{t("auth.signIn")}</h2>
          <p className="panel-framing">{t("scenarios.signInPrompt")}</p>
          <SignInForm idPrefix="scenarios" />
        </section>
      )}
    </div>
  );
}
