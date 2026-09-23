"""Per-team, per-season history: shared by GET /api/team-seasons and
scripts/export_team_seasons.py, so the live API and the static demo build
serve exactly the same shape from exactly the same query.

Reads team_state, which is already keyed by that team's own games-played
count (see CLAUDE.md "Index by games played, not matchweek") -- rankByGame
below is just that column, in order, for one (team, season) pair.
"""

from __future__ import annotations

import re
import sqlite3


def team_slug(name: str) -> str:
    """Must match web/src/teamNames.ts's teamSlug() exactly -- both sides
    turn a team name into the same /teams/:slug key independently."""
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def get_team_seasons(con: sqlite3.Connection) -> dict:
    teams = con.execute(
        """SELECT DISTINCT t.id, t.name
           FROM team_state ts
           JOIN teams t ON t.id = ts.team_id
           JOIN season_pairs sp ON sp.current_season_id = ts.season_id
           ORDER BY t.name"""
    ).fetchall()

    out_teams = []
    for team in teams:
        pairs = con.execute(
            """SELECT sp.id AS pair_id, cur.label AS season, sp.current_season_id AS season_id,
                      pt.in_pair, pt.final_rank
               FROM season_pairs sp
               JOIN seasons cur ON cur.id = sp.current_season_id
               JOIN pair_teams pt ON pt.pair_id = sp.id AND pt.team_id = ?
               WHERE EXISTS (
                 SELECT 1 FROM team_state ts WHERE ts.season_id = sp.current_season_id AND ts.team_id = ?
               )
               ORDER BY sp.id""",
            (team["id"], team["id"]),
        ).fetchall()

        seasons = []
        for pair in pairs:
            games = con.execute(
                """SELECT games_played, points, goal_diff, xg, xga, xgd, live_rank
                   FROM team_state
                   WHERE season_id = ? AND team_id = ?
                   ORDER BY games_played""",
                (pair["season_id"], team["id"]),
            ).fetchall()
            final = games[-1]
            seasons.append(
                {
                    "pairId": pair["pair_id"],
                    "season": pair["season"],
                    "finalRank": pair["final_rank"],
                    "points": final["points"],
                    "gd": final["goal_diff"],
                    "xg": round(final["xg"], 2),
                    "xga": round(final["xga"], 2),
                    "xgd": round(final["xgd"], 2),
                    "inPair": bool(pair["in_pair"]),
                    "rankByGame": [g["live_rank"] for g in games],
                }
            )

        out_teams.append(
            {"id": team["id"], "slug": team_slug(team["name"]), "name": team["name"], "seasons": seasons}
        )

    return {"teams": out_teams}
