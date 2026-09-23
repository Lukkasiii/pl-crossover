"""Freezes per-team, per-season history to static JSON for /teams,
/teams/:slug and Compare mode A, the same way export_demo_frames.py freezes
the replay -- see api/app/team_seasons.py for the query itself, shared with
the live GET /api/team-seasons this mirrors.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402
from api.app.team_seasons import get_team_seasons  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo", "team-seasons.json")


def main() -> None:
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        data = get_team_seasons(con)
    finally:
        con.close()

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    size = os.path.getsize(OUT_PATH)
    print(f"wrote {OUT_PATH} ({len(data['teams'])} teams, {size} bytes)")


if __name__ == "__main__":
    main()
