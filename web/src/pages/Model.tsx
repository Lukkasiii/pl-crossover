import { useEffect } from "react";
import { MetricsBarChart } from "../charts/MetricsBarChart";
import { PredictionTuner } from "../components/PredictionTuner";
import { useLocale } from "../i18n/LocaleContext";
import { useReplayParams } from "../state/ReplayParamsContext";
import { useReplaySession } from "../state/ReplaySessionContext";

export default function Model() {
  const { t } = useLocale();
  const { metric, priorWeight, setPriorWeight, obsVariance } = useReplayParams();
  const { replay } = useReplaySession();

  useEffect(() => {
    document.title = `${t("nav.model")} — ${t("nav.siteTitle")}`;
  }, [t]);

  return (
    <div data-testid="page-model">
      <header className="app-header">
        <h1>{t("nav.model")}</h1>
        <p className="subtitle">{t("model.subtitle")}</p>
      </header>

      {!replay && <p className="placeholder-note">{t("app.loadingPage")}</p>}

      {replay && (
        <div className="page-stack">
          <div>
            <p className="panel-framing">{t("model.tunePriorFraming")}</p>
            <PredictionTuner
              metric={metric}
              games={replay.latestRound?.games ?? 1}
              priorWeight={priorWeight}
              onPriorWeightChange={setPriorWeight}
              obsVariance={obsVariance}
            />
          </div>

          <div>
            <p className="panel-framing">{t("model.currentRmseFraming")}</p>
            <section className="panel">
              <h2>{t("replay.currentRmseByMetric")}</h2>
              <div className="chart-box">
                <MetricsBarChart latestRound={replay.latestRound} />
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
