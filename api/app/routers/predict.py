from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..analytics import compute_predict, get_observations
from ..config import Settings, get_settings
from ..db import get_db
from ..schemas import FitOut, PredictOut, PredictRequest

router = APIRouter(tags=["core"])


@router.post("/api/predict", response_model=PredictOut)
def predict(
    body: PredictRequest,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PredictOut:
    observations = get_observations(db, settings.db_path)
    result = compute_predict(observations, body.metric, body.games, body.prior_weight, body.obs_variance)
    return PredictOut(
        metric=body.metric,
        games=body.games,
        prior_weight=body.prior_weight,
        obs_variance=body.obs_variance,
        prior=FitOut(**result["prior"].as_dict()),
        current=FitOut(**result["current"].as_dict()),
        blended_rmse=result["blended_rmse"],
        blended_mae=result["blended_mae"],
        weight_prior=result["weight_prior"],
        weight_data=result["weight_data"],
    )
