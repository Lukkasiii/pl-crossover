"""Bakes /api/predict's full (metric, games, prior_weight) grid to static
JSON so the demo build's "Tune the prior" panel works with no backend.

/api/predict is a pure function of its inputs -- see api/app/analytics.py's
compute_predict -- so every response the slider could ever ask for can be
precomputed once. This calls the exact same model functions predict.py
calls (ols_fit, bayes_blend, bayes_weights, score_residuals from
api.app.model), just batched instead of refit per grid cell: prior_fit only
depends on metric, current_fit only on (metric, games), and bayes_weights
only on (games, prior_weight) -- none of them need recomputing per cell the
way calling compute_predict 3,040 times over would.

obs_variance stays fixed at the model default; PredictionTuner's slider only
tunes prior_weight, so that's the only extra grid axis.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.analytics import load_observations  # noqa: E402
from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402
from api.app.model import (  # noqa: E402
    DEFAULT_OBS_VARIANCE,
    bayes_blend,
    bayes_weights,
    find_crossover,
    ols_fit,
    predicted_rank,
    score_residuals,
)

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo", "predict-grid.json")
METRICS = ["xg", "xgd", "gd", "points"]
GAMES = list(range(1, 39))
PRIOR_WEIGHTS = list(range(1, 21))  # matches PredictionTuner's slider min=1/max=20/step=1


def fit_dict(fit) -> dict:
    return {"rmse": round(fit.rmse, 4), "mae": round(fit.mae, 4), "r2": round(fit.r2, 4), "n": fit.n}


def main() -> None:
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        observations = load_observations(con)
    finally:
        con.close()

    y = np.array([o.final_rank for o in observations], dtype=float)

    weight_prior: list[list[float]] = []
    weight_data: list[list[float]] = []
    for g in GAMES:
        wp_row, wd_row = [], []
        for pw in PRIOR_WEIGHTS:
            w_prior, w_data = bayes_weights(g, pw, DEFAULT_OBS_VARIANCE)
            wp_row.append(round(w_prior, 4))
            wd_row.append(round(w_data, 4))
        weight_prior.append(wp_row)
        weight_data.append(wd_row)

    prior_fit_out: dict[str, dict] = {}
    current_fit_out: dict[str, list[dict]] = {}
    blended_rmse_out: dict[str, list[list[float]]] = {}
    blended_mae_out: dict[str, list[list[float]]] = {}
    crossover_out: dict[str, float | None] = {}

    for metric in METRICS:
        prior_x = np.array([o.prior[metric] for o in observations], dtype=float)
        prior_fit = ols_fit(prior_x, y)
        prior_pred = predicted_rank(prior_x, prior_fit)
        prior_fit_out[metric] = fit_dict(prior_fit)

        current_fit_rows = []
        blended_rmse_rows = []
        blended_mae_rows = []
        for g in GAMES:
            current_x = np.array([o.current[g][metric] for o in observations], dtype=float)
            current_fit = ols_fit(current_x, y)
            current_pred = predicted_rank(current_x, current_fit)
            current_fit_rows.append(fit_dict(current_fit))

            rmse_row, mae_row = [], []
            for pw in PRIOR_WEIGHTS:
                blended = bayes_blend(prior_pred, current_pred, g, pw, DEFAULT_OBS_VARIANCE)
                score = score_residuals(y, blended)
                rmse_row.append(round(score["rmse"], 4))
                mae_row.append(round(score["mae"], 4))
            blended_rmse_rows.append(rmse_row)
            blended_mae_rows.append(mae_row)

        current_fit_out[metric] = current_fit_rows
        blended_rmse_out[metric] = blended_rmse_rows
        blended_mae_out[metric] = blended_mae_rows
        # The pooled fit's own crossover -- the held-out-checked reference
        # /compare's "season pairs" mode draws its per-pair curves against,
        # since a single pair's own crossover is in-sample noise (see
        # api/app/analytics.py's compute_curve docstring).
        crossover_out[metric] = find_crossover(GAMES, [f["rmse"] for f in current_fit_rows], prior_fit.rmse)

    grid = {
        "games": GAMES,
        "priorWeights": PRIOR_WEIGHTS,
        "obsVariance": DEFAULT_OBS_VARIANCE,
        "priorFit": prior_fit_out,
        "currentFit": current_fit_out,
        "weightPrior": weight_prior,
        "weightData": weight_data,
        "blendedRmse": blended_rmse_out,
        "blendedMae": blended_mae_out,
        "crossover": crossover_out,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(grid, f, separators=(",", ":"))
    print(f"wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)} bytes)")


if __name__ == "__main__":
    main()
