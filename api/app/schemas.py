from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Metric = Literal["xg", "xgd", "gd", "points"]
Method = Literal["pooled", "per_season"]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(v: str) -> str:
    if not _EMAIL_RE.match(v):
        raise ValueError("not a valid email address")
    return v.lower()


# --- seasons / pairs --------------------------------------------------------


class SeasonPairOut(BaseModel):
    id: int
    label: str
    prior_season: str
    current_season: str
    common_team_count: int
    season_start: str
    season_end: str


class TableRow(BaseModel):
    team_id: int
    name: str
    games_played: int
    wins: int
    draws: int
    losses: int
    goals_for: int
    goals_against: int
    goal_diff: int
    points: int
    xg: float
    xga: float
    xgd: float
    live_rank: int | None
    in_pair: bool
    final_rank: int | None


class PairTableOut(BaseModel):
    pair_id: int
    games: int
    rows: list[TableRow]


# --- curves / predict --------------------------------------------------------


class FitOut(BaseModel):
    rmse: float
    mae: float
    r2: float
    n: int


class CurvesOut(BaseModel):
    metric: Metric
    method: Method
    n_observations: int
    n_pairs: int
    games: list[int]
    prior: FitOut
    current_rmse: list[float]
    current_mae: list[float]
    current_r2: list[float]
    loso_rmse: list[float] | None
    crossover: float | None
    crossover_loso: float | None


class PredictRequest(BaseModel):
    metric: Metric
    games: int = Field(ge=1, le=38)
    prior_weight: float = Field(default=5.0, ge=0)
    obs_variance: float = Field(default=1.5, gt=0)


class PredictOut(BaseModel):
    metric: Metric
    games: int
    prior_weight: float
    obs_variance: float
    prior: FitOut
    current: FitOut
    blended_rmse: float
    blended_mae: float
    weight_prior: float
    weight_data: float


# --- auth ---------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)

    _validate_email = field_validator("email")(_validate_email)


class LoginRequest(BaseModel):
    email: str
    password: str

    _validate_email = field_validator("email")(_validate_email)


class AccessTokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: int
    email: str


# --- scenarios ---------------------------------------------------------


class ScenarioParams(BaseModel):
    metric: Metric
    method: Method = "pooled"
    prior_weight: float = Field(default=5.0, ge=0)
    obs_variance: float = Field(default=1.5, gt=0)


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    params: ScenarioParams


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    params: ScenarioParams | None = None


class ScenarioOut(BaseModel):
    id: int
    name: str
    params: ScenarioParams
    created_at: str
    updated_at: str
