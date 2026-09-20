import { useState } from "react";
import { Slider } from "./ui/Slider";
import { WeightBars } from "../charts/WeightBars";
import { PredictRmseBars } from "../charts/PredictRmseBars";
import { usePredict } from "../api/usePredict";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { Metric } from "../ws/types";

const DEFAULT_PRIOR_WEIGHT = 5;
const MIN_PRIOR_WEIGHT = 1;
const MAX_PRIOR_WEIGHT = 20;

interface PredictionTunerProps {
  metric: Metric;
  games: number;
}

/**
 * The original study hard-codes w_prior = 5. This panel makes that number a
 * slider: drag posts a debounced /api/predict and the weight bars + RMSE
 * bars re-render from the response, at whatever games count the replay is
 * currently on. usePredict keys its TanStack Query cache by every input the
 * response depends on, so a stale request finishing late can't clobber a
 * newer one and dragging back to an already-seen value is a cache hit.
 */
export function PredictionTuner({ metric, games }: PredictionTunerProps) {
  const [priorWeight, setPriorWeight] = useState(DEFAULT_PRIOR_WEIGHT);
  const debouncedPriorWeight = useDebouncedValue(priorWeight, 300);
  const { data, isFetching, isLoading, error } = usePredict(metric, games, debouncedPriorWeight);

  const sigmaPrior = Math.sqrt(1 / priorWeight);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tune the prior</h2>
        <span className="predict-value">
          w_prior = {priorWeight} (σ_prior ≈ {sigmaPrior.toFixed(2)})
        </span>
      </div>

      <Slider
        aria-label="prior weight"
        min={MIN_PRIOR_WEIGHT}
        max={MAX_PRIOR_WEIGHT}
        value={priorWeight}
        onValueChange={setPriorWeight}
        onValueCommit={setPriorWeight}
      />

      {error && <p className="predict-note error">failed to recompute the posterior</p>}
      {!error && isLoading && <p className="predict-note">loading…</p>}

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
