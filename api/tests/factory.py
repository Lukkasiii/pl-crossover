"""Synthetic Premier-League-shaped fixtures, shared by the ETL and API tests.

Generates complete 20-team seasons with a deterministic RNG and runs them
through the real `build_db` pipeline, so every test exercises the actual
schema rather than a hand-rolled stand-in.
"""

from __future__ import annotations

import csv
import math
import os
import random
import sqlite3

TEAMS = [f"Team {chr(65 + i)}" for i in range(20)]


def make_season(season: int, rng: random.Random) -> list[dict]:
    """A full double round robin: 20 teams, 38 games each, 380 matches."""
    rows = []
    match_id = season * 10_000
    fixtures = [(h, a) for h in TEAMS for a in TEAMS if h != a]
    rng.shuffle(fixtures)

    # Give each team a fixed strength so the table is not pure noise and the
    # regression has something to find.
    strength = {t: rng.uniform(0.6, 2.2) for t in TEAMS}

    for day, (home, away) in enumerate(fixtures):
        hx = max(0.05, rng.gauss(strength[home] * 1.15, 0.45))
        ax = max(0.05, rng.gauss(strength[away] * 0.85, 0.45))
        rows.append(
            {
                "match_id": match_id,
                "season": season,
                "datetime": f"{season}-08-01 12:00:00" if day == 0 else _stamp(season, day),
                "home_team": home,
                "away_team": away,
                "home_goals": _poisson(hx, rng),
                "away_goals": _poisson(ax, rng),
                "home_xg": round(hx, 5),
                "away_xg": round(ax, 5),
            }
        )
        match_id += 1
    return rows


def _stamp(season: int, day: int) -> str:
    month = 8 + (day // 40)
    year = season + (month - 1) // 12
    return f"{year}-{((month - 1) % 12) + 1:02d}-{(day % 28) + 1:02d} 15:00:00"


def _poisson(lam: float, rng: random.Random) -> int:
    el, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= el:
            return k
        k += 1
        if k > 12:
            return k


def build_synthetic_db(tmp_path_factory, seasons: tuple[int, ...], seed: int = 20260918) -> str:
    """Writes raw CSVs for each season and runs build_db over them.

    Returns the path to the resulting sqlite file. `build_db` must already be
    importable (tests add `scripts/` to sys.path before calling this).
    """
    import build_db

    rng = random.Random(seed)
    raw_dir = tmp_path_factory.mktemp("raw")
    for season in seasons:
        rows = make_season(season, rng)
        path = raw_dir / f"understat_EPL_{season}.csv"
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    db_path = tmp_path_factory.mktemp("db") / "test.db"
    build_db.build(str(raw_dir), str(db_path))
    return str(db_path)


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con
