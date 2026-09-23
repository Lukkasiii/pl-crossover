from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..schemas import TeamSeasonsOut
from ..team_seasons import get_team_seasons

router = APIRouter(tags=["core"])


@router.get("/api/team-seasons", response_model=TeamSeasonsOut)
def team_seasons(db: sqlite3.Connection = Depends(get_db)) -> TeamSeasonsOut:
    return TeamSeasonsOut(**get_team_seasons(db))
