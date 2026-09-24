"""Per-team squad for one season pair's current season: shared by
GET /api/team-players and scripts/export_team_players.py, the same way
team_seasons.py is shared by the team-history endpoint and its export.
"""

from __future__ import annotations

import sqlite3


def get_team_players(con: sqlite3.Connection, pair_id: int, team_id: int) -> dict:
    season_row = con.execute("SELECT current_season_id FROM season_pairs WHERE id = ?", (pair_id,)).fetchone()
    if season_row is None:
        return {"players": [], "excludedMidSeasonTransfers": 0}
    season_id = season_row["current_season_id"]

    players = con.execute(
        """SELECT name, position, games, minutes, goals, xg, assists, xa, shots,
                  key_passes, npg, npxg, xg_chain, xg_buildup, yellow_cards, red_cards
           FROM players
           WHERE season_id = ? AND team_id = ?
           ORDER BY minutes DESC""",
        (season_id, team_id),
    ).fetchall()

    excluded = con.execute(
        "SELECT COUNT(*) FROM players WHERE season_id = ? AND team_id IS NULL", (season_id,)
    ).fetchone()[0]

    return {
        "players": [
            {
                "name": p["name"],
                "position": p["position"],
                "games": p["games"],
                "minutes": p["minutes"],
                "goals": p["goals"],
                "xg": round(p["xg"], 2),
                "assists": p["assists"],
                "xa": round(p["xa"], 2),
                "shots": p["shots"],
                "keyPasses": p["key_passes"],
                "npg": p["npg"],
                "npxg": round(p["npxg"], 2),
                "xgChain": round(p["xg_chain"], 2),
                "xgBuildup": round(p["xg_buildup"], 2),
                "yellowCards": p["yellow_cards"],
                "redCards": p["red_cards"],
            }
            for p in players
        ],
        "excludedMidSeasonTransfers": excluded,
    }
