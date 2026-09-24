from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..players import get_team_players
from ..schemas import TeamPlayersOut, TeamSeasonsOut
from ..team_seasons import get_team_seasons

router = APIRouter(tags=["core"])


@router.get("/api/team-seasons", response_model=TeamSeasonsOut)
def team_seasons(db: sqlite3.Connection = Depends(get_db)) -> TeamSeasonsOut:
    return TeamSeasonsOut(**get_team_seasons(db))


@router.get("/api/team-players", response_model=TeamPlayersOut)
def team_players(pair_id: int, team_id: int, db: sqlite3.Connection = Depends(get_db)) -> TeamPlayersOut:
    return TeamPlayersOut(**get_team_players(db, pair_id, team_id))
