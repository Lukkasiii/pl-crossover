from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..schemas import SeasonPairOut

router = APIRouter(tags=["core"])


@router.get("/api/seasons", response_model=list[SeasonPairOut])
def list_seasons(db: sqlite3.Connection = Depends(get_db)) -> list[SeasonPairOut]:
    rows = db.execute(
        """SELECT sp.id, sp.label, sp.common_team_count,
                  prior.label AS prior_label, cur.label AS current_label
           FROM season_pairs sp
           JOIN seasons prior ON prior.id = sp.prior_season_id
           JOIN seasons cur ON cur.id = sp.current_season_id
           ORDER BY prior.start_year"""
    ).fetchall()
    return [
        SeasonPairOut(
            id=r["id"],
            label=r["label"],
            prior_season=r["prior_label"],
            current_season=r["current_label"],
            common_team_count=r["common_team_count"],
        )
        for r in rows
    ]
