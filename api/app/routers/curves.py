from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..analytics import get_curve
from ..config import Settings, get_settings
from ..db import get_db
from ..schemas import CurvesOut, FitOut, Metric, Method

router = APIRouter(tags=["core"])


@router.get("/api/curves", response_model=CurvesOut)
def curves(
    metric: Metric,
    method: Method = "pooled",
    # Scopes the curve to one season pair's own ~17 observations instead of
    # all 136 -- see analytics.compute_curve's docstring. Used by /compare's
    # "two season pairs" mode; every other caller leaves this unset.
    pair_id: int | None = None,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CurvesOut:
    if pair_id is not None and db.execute("SELECT 1 FROM season_pairs WHERE id = ?", (pair_id,)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no season pair with id {pair_id}")
    c = get_curve(db, settings.db_path, metric, method, pair_id)
    return CurvesOut(
        metric=metric,
        method=method,
        n_observations=c["n_observations"],
        n_pairs=c["n_pairs"],
        games=c["games"],
        prior=FitOut(**c["prior"].as_dict()),
        current_rmse=[f.rmse for f in c["current"]],
        current_mae=[f.mae for f in c["current"]],
        current_r2=[f.r2 for f in c["current"]],
        loso_rmse=[f.rmse for f in c["loso"]] if c["loso"] is not None else None,
        crossover=c["crossover"],
        crossover_loso=c["crossover_loso"],
    )
