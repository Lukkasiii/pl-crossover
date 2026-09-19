"""
Prediction engine.

Everything here is a pure function over numpy arrays: no database, no FastAPI,
no globals. That keeps the maths unit-testable on its own and lets the API layer
stay a thin wrapper.

The question the model answers, for one pair of seasons (prior -> current):

    Using only the first N games of the current season, how well can we predict
    where each team finishes? And at what N does that beat what we already knew
    from the prior season's full-season numbers?

Following the original coursework, "how well" is the RMSE of an ordinary least
squares fit of final league position on the predictor, pooled across all season
pairs (n = 17 teams x 8 pairs = 136 observations).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np

# Weights from the coursework's conjugate-normal update.
DEFAULT_PRIOR_WEIGHT = 5.0  # w_prior = 1 / sigma^2_prior, held fixed
DEFAULT_OBS_VARIANCE = 1.5  # w_data  = N / sigma^2_obs, grows with games played


@dataclass(frozen=True)
class FitResult:
    """Goodness of fit of one predictor against final league position."""

    rmse: float
    mae: float
    r2: float
    slope: float
    intercept: float
    n: int

    def as_dict(self) -> dict:
        return {k: round(v, 6) if isinstance(v, float) else v for k, v in asdict(self).items()}


def ols_fit(x: np.ndarray, y: np.ndarray) -> FitResult:
    """Least-squares fit of y on x, scored in-sample.

    In-sample scoring matches the original analysis. It is the right choice for
    a descriptive question ("how much of final position does this metric
    explain?") and the wrong one for a forecasting claim; `ols_fit_loso` below
    gives the held-out version for comparison.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if x.size != y.size:
        raise ValueError(f"x and y must be the same length, got {x.size} and {y.size}")
    if x.size < 3:
        raise ValueError(f"need at least 3 observations to fit, got {x.size}")
    if np.allclose(x, x[0]):
        raise ValueError("predictor is constant; cannot fit a slope")

    slope, intercept = np.polyfit(x, y, 1)
    resid = y - (intercept + slope * x)
    ss_tot = np.sum((y - y.mean()) ** 2)

    return FitResult(
        rmse=float(np.sqrt(np.mean(resid**2))),
        mae=float(np.mean(np.abs(resid))),
        r2=float(1.0 - np.sum(resid**2) / ss_tot) if ss_tot > 0 else float("nan"),
        slope=float(slope),
        intercept=float(intercept),
        n=int(x.size),
    )


def ols_fit_loso(x: np.ndarray, y: np.ndarray, groups: np.ndarray) -> FitResult:
    """Leave-one-season-out version of `ols_fit`.

    Refits the line with one season pair held out, predicts that season, and
    pools the out-of-sample residuals. This is the honest answer to "would this
    have predicted a season it never saw", and it is what the UI shows next to
    the in-sample number so the difference is visible rather than hidden.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    groups = np.asarray(groups)

    resid = np.empty_like(y)
    for g in np.unique(groups):
        test = groups == g
        train = ~test
        if train.sum() < 3 or np.allclose(x[train], x[train][0]):
            resid[test] = np.nan
            continue
        slope, intercept = np.polyfit(x[train], y[train], 1)
        resid[test] = y[test] - (intercept + slope * x[test])

    ok = ~np.isnan(resid)
    resid = resid[ok]
    ss_tot = np.sum((y[ok] - y[ok].mean()) ** 2)

    return FitResult(
        rmse=float(np.sqrt(np.mean(resid**2))),
        mae=float(np.mean(np.abs(resid))),
        r2=float(1.0 - np.sum(resid**2) / ss_tot) if ss_tot > 0 else float("nan"),
        slope=float("nan"),
        intercept=float("nan"),
        n=int(resid.size),
    )


def predicted_rank(x: np.ndarray, fit: FitResult) -> np.ndarray:
    """Map predictor values onto the final-position scale using a fitted line."""
    return fit.intercept + fit.slope * np.asarray(x, dtype=float)


def bayes_weights(
    games_played: int,
    prior_weight: float = DEFAULT_PRIOR_WEIGHT,
    obs_variance: float = DEFAULT_OBS_VARIANCE,
) -> tuple[float, float]:
    """Precision weights for the conjugate-normal update.

    The prior's weight is fixed: last season's table does not get more
    informative as this season goes on. The data's weight grows linearly with
    the number of games observed, so the posterior slides from prior-led to
    data-led on its own. The crossover in the weights is a property of the
    model; the crossover in RMSE is a property of the data. They are different
    events and the dashboard plots both.
    """
    if games_played < 0:
        raise ValueError(f"games_played must be non-negative, got {games_played}")
    if prior_weight < 0 or obs_variance <= 0:
        raise ValueError("prior_weight must be >= 0 and obs_variance must be > 0")

    w_prior = float(prior_weight)
    w_data = games_played / float(obs_variance)
    return w_prior, w_data


def bayes_blend(
    prior_pred: np.ndarray,
    current_pred: np.ndarray,
    games_played: int,
    prior_weight: float = DEFAULT_PRIOR_WEIGHT,
    obs_variance: float = DEFAULT_OBS_VARIANCE,
) -> np.ndarray:
    """Precision-weighted posterior mean of two rank predictions.

        mu* = (w_prior * mu_prior + w_data * y_bar) / (w_prior + w_data)

    Both inputs are already on the final-position scale (see `predicted_rank`),
    so the blend is a weighted average of two competing guesses at the same
    quantity rather than a mix of two different units.
    """
    prior_pred = np.asarray(prior_pred, dtype=float)
    current_pred = np.asarray(current_pred, dtype=float)
    w_prior, w_data = bayes_weights(games_played, prior_weight, obs_variance)

    total = w_prior + w_data
    if total == 0:
        raise ValueError("prior_weight and games_played cannot both be zero")
    return (w_prior * prior_pred + w_data * current_pred) / total


def score_residuals(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """RMSE / MAE for an arbitrary prediction vector."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    resid = y_true - y_pred
    return {
        "rmse": float(np.sqrt(np.mean(resid**2))),
        "mae": float(np.mean(np.abs(resid))),
        "n": int(resid.size),
    }


def find_crossover(games: list[int], current_rmse: list[float], prior_rmse: float) -> float | None:
    """First point where the current season becomes the better predictor.

    Returns a fractional number of games, linearly interpolated between the two
    bracketing observations, or None if the current season never gets there
    within the range supplied. With match-level data the grid is every game, so
    the interpolation is cosmetic -- on the original 5/10/15/20 checkpoint grid
    it was doing real work.
    """
    for i, rmse in enumerate(current_rmse):
        if rmse <= prior_rmse:
            if i == 0:
                return float(games[0])
            x0, x1 = games[i - 1], games[i]
            y0, y1 = current_rmse[i - 1], rmse
            if y0 == y1:
                return float(x1)
            return float(x0 + (x1 - x0) * (y0 - prior_rmse) / (y0 - y1))
    return None
