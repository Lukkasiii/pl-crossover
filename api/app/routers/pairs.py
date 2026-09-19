from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import get_db
from ..schemas import PairTableOut, TableRow

router = APIRouter(tags=["core"])


@router.get("/api/pairs/{pair_id}/table", response_model=PairTableOut)
def pair_table(
    pair_id: int, games: int = Query(ge=1, le=38), db: sqlite3.Connection = Depends(get_db)
) -> PairTableOut:
    pair = db.execute("SELECT current_season_id FROM season_pairs WHERE id = ?", (pair_id,)).fetchone()
    if pair is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no season pair with id {pair_id}")

    rows = db.execute(
        """SELECT t.id AS team_id, t.name, ts.games_played, ts.wins, ts.draws, ts.losses,
                  ts.goals_for, ts.goals_against, ts.goal_diff, ts.points, ts.xg, ts.xga, ts.xgd,
                  ts.live_rank, pt.in_pair, pt.final_rank
           FROM team_state ts
           JOIN teams t ON t.id = ts.team_id
           JOIN pair_teams pt ON pt.pair_id = ? AND pt.team_id = ts.team_id
           WHERE ts.season_id = ? AND ts.games_played = ?
           ORDER BY ts.live_rank""",
        (pair_id, pair["current_season_id"], games),
    ).fetchall()
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no data at games={games} for pair {pair_id}")

    return PairTableOut(
        pair_id=pair_id,
        games=games,
        rows=[
            TableRow(
                team_id=r["team_id"],
                name=r["name"],
                games_played=r["games_played"],
                wins=r["wins"],
                draws=r["draws"],
                losses=r["losses"],
                goals_for=r["goals_for"],
                goals_against=r["goals_against"],
                goal_diff=r["goal_diff"],
                points=r["points"],
                xg=r["xg"],
                xga=r["xga"],
                xgd=r["xgd"],
                live_rank=r["live_rank"],
                in_pair=bool(r["in_pair"]),
                final_rank=r["final_rank"],
            )
            for r in rows
        ],
    )
