import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { ScenariosPanel } from "../components/auth/ScenariosPanel";
import { useLocale } from "../i18n/LocaleContext";
import { useReplayParams } from "../state/ReplayParamsContext";

/**
 * Auth-gated for *saving*, not for viewing -- same rule as pre-v2
 * (CLAUDE.md Feature 4): signed out shows an inline prompt, never a
 * redirect wall. "Current" params to save come from ReplayParamsContext,
 * shared with /season, so tuning the dashboard there and saving here work
 * across the route split exactly like they did in one page.
 */
export default function Scenarios() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { currentScenarioParams, loadScenario } = useReplayParams();

  useEffect(() => {
    document.title = `${t("nav.scenarios")} — ${t("nav.siteTitle")}`;
  }, [t]);

  return (
    <div data-testid="page-scenarios">
      <header className="app-header">
        <h1>{t("nav.scenarios")}</h1>
      </header>

      {user ? (
        <ScenariosPanel current={currentScenarioParams} onLoad={loadScenario} />
      ) : (
        <p className="placeholder-note" data-testid="scenarios-sign-in-prompt">
          {t("scenarios.signInPrompt")}
        </p>
      )}
    </div>
  );
}
