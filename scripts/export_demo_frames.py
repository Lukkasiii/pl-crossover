"""Freezes the live replay into static JSON so the frontend can deploy as a
demo with no backend at all.

Reuses the same DB connection and frame builder the WebSocket server uses
(`api.app.replay.build_frames`), so the static demo and the live app are
guaranteed to show identical data -- this is a dump of the real thing, not a
fixture written by hand.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402
from api.app.replay import build_frames  # noqa: E402
from api.app.schemas import SeasonPairOut  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo")


def export_seasons(con) -> list[dict]:
    rows = con.execute(
        """SELECT sp.id, sp.label, sp.common_team_count,
                  prior.label AS prior_label, cur.label AS current_label,
                  MIN(m.played_at) AS season_start, MAX(m.played_at) AS season_end
           FROM season_pairs sp
           JOIN seasons prior ON prior.id = sp.prior_season_id
           JOIN seasons cur ON cur.id = sp.current_season_id
           JOIN matches m ON m.season_id = cur.id
           GROUP BY sp.id
           ORDER BY prior.start_year"""
    ).fetchall()
    pairs = [
        SeasonPairOut(
            id=r["id"],
            label=r["label"],
            prior_season=r["prior_label"],
            current_season=r["current_label"],
            common_team_count=r["common_team_count"],
            season_start=r["season_start"].replace(" ", "T"),
            season_end=r["season_end"].replace(" ", "T"),
        )
        for r in rows
    ]
    return [p.model_dump() for p in pairs]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        pairs = export_seasons(con)
        with open(os.path.join(OUT_DIR, "seasons.json"), "w") as f:
            json.dump(pairs, f)
        print(f"wrote {len(pairs)} season pairs")

        for pair in pairs:
            frames = build_frames(con, settings.db_path, pair["id"])
            assert frames is not None
            path = os.path.join(OUT_DIR, f"frames-{pair['id']}.json")
            with open(path, "w") as f:
                json.dump(frames, f)
            print(f"wrote {path} ({len(frames)} frames)")
    finally:
        con.close()


if __name__ == "__main__":
    main()
