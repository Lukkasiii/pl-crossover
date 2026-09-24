"""Bakes one file per season pair with every one of that pair's current
season's teams' squads, for /teams/:slug's "Key players" section -- shared
query (api/app/players.py) with the live GET /api/team-players this mirrors.

One file per pair, not one big file or one file per (pair, team): a team
page only ever needs the pair currently selected, and 20 teams' worth of
squads in one ~90KB file is a reasonable unit to lazy-load per season
picked, the same granularity frames-<pairId>.json already uses for the
replay.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402
from api.app.players import get_team_players  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo")


def main() -> None:
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        pairs = con.execute("SELECT id FROM season_pairs ORDER BY id").fetchall()
        for pair in pairs:
            pair_id = pair["id"]
            teams = con.execute("SELECT id FROM teams ORDER BY id").fetchall()
            out = {"excludedMidSeasonTransfers": 0, "teams": {}}
            for team in teams:
                data = get_team_players(con, pair_id, team["id"])
                if not data["players"]:
                    continue
                out["teams"][str(team["id"])] = data["players"]
                out["excludedMidSeasonTransfers"] = data["excludedMidSeasonTransfers"]

            path = os.path.join(OUT_DIR, f"players-{pair_id}.json")
            with open(path, "w") as f:
                json.dump(out, f, separators=(",", ":"))
            print(f"wrote {path} ({len(out['teams'])} teams, {os.path.getsize(path)} bytes)")
    finally:
        con.close()


if __name__ == "__main__":
    main()
