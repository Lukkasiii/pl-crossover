"""Synthetic Premier-League-shaped fixtures, shared by the ETL and API tests.

Generates complete 20-team seasons with a deterministic RNG and runs them
through the real `build_db` pipeline, so every test exercises the actual
schema rather than a hand-rolled stand-in.
"""

from __future__ import annotations

import csv
import json
import math
import os
import random
import sqlite3

TEAMS = [f"Team {chr(65 + i)}" for i in range(20)]
POSITIONS = ["F", "M", "D", "GK"]


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


def make_players(season: int, rng: random.Random) -> list[dict]:
    """A players payload shaped like Understat's raw JSON: one row per player-
    season, values as strings (as the real API returns them), the invariants
    build_db/tests rely on preserved (goals >= npg, xG >= npxG, minutes <=
    38*90), plus a couple of comma-team_title rows so the mid-season-transfer
    exclusion path (see build_db.py's players table comment) is exercised.
    """
    players = []
    player_id = season * 1000

    def one(team_title: str) -> dict:
        nonlocal player_id
        minutes = rng.randint(0, 38 * 90)
        games = min(38, max(1, minutes // 60))
        goals = rng.randint(0, 20)
        npg = rng.randint(0, goals)
        xg = round(rng.uniform(npg, goals + 3), 4)
        npxg = round(rng.uniform(0, xg), 4)
        assists = rng.randint(0, 15)
        xa = round(rng.uniform(0, assists + 2), 4)
        row = {
            "id": str(player_id),
            "player_name": f"Player {player_id}",
            "games": str(games),
            "time": str(minutes),
            "goals": str(goals),
            "xG": str(xg),
            "assists": str(assists),
            "xA": str(xa),
            "shots": str(goals + rng.randint(0, 40)),
            "key_passes": str(rng.randint(0, 60)),
            "yellow_cards": str(rng.randint(0, 8)),
            "red_cards": str(rng.randint(0, 1)),
            "position": rng.choice(POSITIONS),
            "team_title": team_title,
            "npg": str(npg),
            "npxG": str(npxg),
            "xGChain": str(round(xg + xa + rng.uniform(0, 5), 4)),
            "xGBuildup": str(round(rng.uniform(0, xg), 4)),
        }
        player_id += 1
        return row

    for team in TEAMS:
        for _ in range(rng.randint(18, 24)):
            players.append(one(team))

    # ~2% of real player-seasons are a mid-season transfer aggregated across
    # both clubs (see CLAUDE.md "4a. ETL") -- two rows here is the same shape.
    players.append(one(f"{TEAMS[0]},{TEAMS[1]}"))
    players.append(one(f"{TEAMS[2]},{TEAMS[3]}"))

    return players


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

        players_path = raw_dir / f"understat_EPL_{season}.json"
        with open(players_path, "w", encoding="utf-8") as fh:
            json.dump({"teams": {}, "players": make_players(season, rng), "dates": {}}, fh)

    db_path = tmp_path_factory.mktemp("db") / "test.db"
    build_db.build(str(raw_dir), str(db_path))
    return str(db_path)


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con
