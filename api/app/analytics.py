"""DB -> numpy bridge for the model, plus the process-lifetime caches.

`model.py` stays pure; everything here is the thin translation from
`data/pl.db` rows into the arrays it expects, done once per database and
reused by every route and by the replay's round frames. Caches are keyed by
db path (not by connection) so `TestClient` runs against different tmp
databases in the same process never collide.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

import numpy as np

from .model import (
    FitResult,
    bayes_weights,
    find_crossover,
    ols_fit,
    ols_fit_loso,
    ols_fit_per_group,
)

FULL_SEASON_GAMES = 38
METRIC_COLUMNS = {"xg": "xg", "xgd": "xgd", "gd": "goal_diff", "points": "points"}


@dataclass
class Observation:
    """One (team, season pair) row with every predictor value we might need."""

    pair_id: int
    team_id: int
    final_rank: int
    prior: dict[str, float] = field(default_factory=dict)
    current: dict[int, dict[str, float]] = field(default_factory=dict)


def load_observations(con: sqlite3.Connection) -> list[Observation]:
    pairs = con.execute(
        """SELECT pt.pair_id, pt.team_id, pt.final_rank,
                  sp.prior_season_id, sp.current_season_id
           FROM pair_teams pt JOIN season_pairs sp ON sp.id = pt.pair_id
           WHERE pt.in_pair = 1 AND pt.final_rank IS NOT NULL"""
    ).fetchall()

    state = {
        (r["season_id"], r["team_id"], r["games_played"]): r
        for r in con.execute(
            "SELECT season_id, team_id, games_played, goal_diff, points, xg, xgd FROM team_state"
        )
    }

    observations = []
    for p in pairs:
        prior_row = state.get((p["prior_season_id"], p["team_id"], FULL_SEASON_GAMES))
        if prior_row is None:
            continue
        current_rows = {
            g: state[(p["current_season_id"], p["team_id"], g)]
            for g in range(1, FULL_SEASON_GAMES + 1)
            if (p["current_season_id"], p["team_id"], g) in state
        }
        if len(current_rows) < FULL_SEASON_GAMES:
            continue

        observations.append(
            Observation(
                pair_id=p["pair_id"],
                team_id=p["team_id"],
                final_rank=p["final_rank"],
                prior={m: prior_row[col] for m, col in METRIC_COLUMNS.items()},
                current={g: {m: row[col] for m, col in METRIC_COLUMNS.items()} for g, row in current_rows.items()},
            )
        )
    return observations


def compute_curve(observations: list[Observation], metric: str, method: str) -> dict:
    y = np.array([o.final_rank for o in observations], dtype=float)
    groups = np.array([o.pair_id for o in observations])
    prior_x = np.array([o.prior[metric] for o in observations], dtype=float)
    prior_fit = ols_fit(prior_x, y)

    games = list(range(1, FULL_SEASON_GAMES + 1))
    current_fits: list[FitResult] = []
    loso_fits: list[FitResult] | None = [] if method == "pooled" else None
    for g in games:
        x = np.array([o.current[g][metric] for o in observations], dtype=float)
        current_fits.append(ols_fit(x, y) if method == "pooled" else ols_fit_per_group(x, y, groups))
        if loso_fits is not None:
            loso_fits.append(ols_fit_loso(x, y, groups))

    current_rmse = [f.rmse for f in current_fits]
    loso_rmse = [f.rmse for f in loso_fits] if loso_fits is not None else None

    return {
        "n_observations": len(observations),
        "n_pairs": len(set(groups.tolist())),
        "games": games,
        "prior": prior_fit,
        "current": current_fits,
        "loso": loso_fits,
        "crossover": find_crossover(games, current_rmse, prior_fit.rmse),
        "crossover_loso": find_crossover(games, loso_rmse, prior_fit.rmse) if loso_rmse is not None else None,
    }


def compute_predict(
    observations: list[Observation], metric: str, games: int, prior_weight: float, obs_variance: float
) -> dict:
    from .model import bayes_blend, predicted_rank, score_residuals

    y = np.array([o.final_rank for o in observations], dtype=float)
    prior_x = np.array([o.prior[metric] for o in observations], dtype=float)
    current_x = np.array([o.current[games][metric] for o in observations], dtype=float)

    prior_fit = ols_fit(prior_x, y)
    current_fit = ols_fit(current_x, y)
    blended = bayes_blend(
        predicted_rank(prior_x, prior_fit),
        predicted_rank(current_x, current_fit),
        games,
        prior_weight,
        obs_variance,
    )
    blended_score = score_residuals(y, blended)
    w_prior, w_data = bayes_weights(games, prior_weight, obs_variance)

    return {
        "prior": prior_fit,
        "current": current_fit,
        "blended_rmse": blended_score["rmse"],
        "blended_mae": blended_score["mae"],
        "weight_prior": w_prior,
        "weight_data": w_data,
    }


_obs_cache: dict[str, list[Observation]] = {}
_curve_cache: dict[tuple[str, str, str], dict] = {}


def get_observations(con: sqlite3.Connection, db_path: str) -> list[Observation]:
    if db_path not in _obs_cache:
        _obs_cache[db_path] = load_observations(con)
    return _obs_cache[db_path]


def get_curve(con: sqlite3.Connection, db_path: str, metric: str, method: str) -> dict:
    key = (db_path, metric, method)
    if key not in _curve_cache:
        _curve_cache[key] = compute_curve(get_observations(con, db_path), metric, method)
    return _curve_cache[key]
