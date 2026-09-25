import { Slider } from "./ui/Slider";
import { InfoTooltip } from "./ui/InfoTooltip";
import { WeightBars } from "../charts/WeightBars";
import { PredictRmseBars } from "../charts/PredictRmseBars";
import { usePredict, DEFAULT_OBS_VARIANCE } from "../api/usePredict";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useLocale } from "../i18n/LocaleContext";
import type { Metric } from "../ws/types";

const MIN_PRIOR_WEIGHT = 1;
const MAX_PRIOR_WEIGHT = 20;

interface PredictionTunerProps {
  metric: Metric;
  games: number;
  priorWeight: number;
  onPriorWeightChange: (priorWeight: number) => void;
  obsVariance?: number;
  /** Set briefly when an Ask-the-Model tool-call chip that relates to this panel is clicked (see AskPanel.tsx). */
  highlighted?: boolean;
}

/**
 * The original study hard-codes w_prior = 5. This panel makes that number a
 * slider: drag posts a debounced /api/predict and the weight bars + RMSE
 * bars re-render from the response, at whatever games count the replay is
 * currently on. usePredict keys its TanStack Query cache by every input the
 * response depends on, so a stale request finishing late can't clobber a
 * newer one and dragging back to an already-seen value is a cache hit.
 *
 * `priorWeight` is controlled by App (not local state) so a saved scenario
 * can restore it -- the slider is otherwise the only thing that ever sets it.
 */
export function PredictionTuner({
  metric,
  games,
  priorWeight,
  onPriorWeightChange,
  obsVariance = DEFAULT_OBS_VARIANCE,
  highlighted = false,
}: PredictionTunerProps) {
  const { t } = useLocale();
  const debouncedPriorWeight = useDebouncedValue(priorWeight, 300);
  const { data, isFetching, isLoading, error } = usePredict(metric, games, debouncedPriorWeight, obsVariance);

  const sigmaPrior = Math.sqrt(1 / priorWeight);

  return (
    <section className={highlighted ? "panel panel-highlighted" : "panel"}>
      <div className="panel-header">
        <div className="panel-title">
          <h2>{t("replay.tunePrior")}</h2>
          <InfoTooltip
            aria-label={t("panelInfo.about", { panel: t("replay.tunePrior") })}
            data-testid="tune-prior-info"
          >
            {t("panelInfo.tunePrior")}
          </InfoTooltip>
        </div>
        <span className="predict-value">
          w_prior = {priorWeight} (σ_prior ≈ {sigmaPrior.toFixed(2)})
        </span>
      </div>

      <Slider
        aria-label={t("replay.priorWeightLabel")}
        data-testid="prior-weight-slider"
        min={MIN_PRIOR_WEIGHT}
        max={MAX_PRIOR_WEIGHT}
        value={priorWeight}
        onValueChange={onPriorWeightChange}
        onValueCommit={onPriorWeightChange}
      />

      {error && <p className="predict-note error">{t("replay.failedPredict")}</p>}
      {!error && isLoading && <p className="predict-note">{t("replay.loading")}</p>}

      {!error && data && (
        <div className={isFetching ? "predict-fading" : undefined}>
          <div className="chart-box small">
            <WeightBars weights={{ prior: data.weight_prior, data: data.weight_data }} />
          </div>
          <div className="chart-box">
            <PredictRmseBars predict={data} />
          </div>
        </div>
      )}
    </section>
  );
}
