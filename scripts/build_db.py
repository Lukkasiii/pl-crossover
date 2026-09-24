#!/usr/bin/env python3
"""
Build the application database from the raw match files.

Input:  data/raw/understat_EPL_<year>.csv   (written by scripts/fetch_understat.py)
Output: data/pl.db                          (SQLite)

The central table is `team_state`: one row per team per *games played*, holding
the cumulative league table as it stood after that team's Nth match. Everything
the dashboard streams comes out of that table.

Games played, not calendar matchweek
------------------------------------
Premier League matchweeks are not aligned in practice -- games get postponed and
replayed weeks later, so on any given date teams have played different numbers
of matches. The research question is "after a team has played N games, how much
do we know about it", so the index here is that team's own game count, ordered
by kickoff time. This also makes 2019/20 (suspended for three months) behave the
same as every other season.

    python3 scripts/build_db.py
    python3 scripts/build_db.py --raw data/raw --db data/pl.db
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

SEASON_LENGTH = 38

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE teams (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE seasons (
    id         INTEGER PRIMARY KEY,
    start_year INTEGER NOT NULL UNIQUE,
    label      TEXT    NOT NULL UNIQUE      -- '2017/18'
);

CREATE TABLE matches (
    id           INTEGER PRIMARY KEY,
    understat_id INTEGER NOT NULL UNIQUE,
    season_id    INTEGER NOT NULL REFERENCES seasons(id),
    played_at    TEXT    NOT NULL,
    home_team_id INTEGER NOT NULL REFERENCES teams(id),
    away_team_id INTEGER NOT NULL REFERENCES teams(id),
    home_goals   INTEGER NOT NULL,
    away_goals   INTEGER NOT NULL,
    home_xg      REAL    NOT NULL,
    away_xg      REAL    NOT NULL
);
CREATE INDEX idx_matches_season ON matches(season_id, played_at);

-- Cumulative league table after each team's Nth game of the season.
CREATE TABLE team_state (
    season_id     INTEGER NOT NULL REFERENCES seasons(id),
    team_id       INTEGER NOT NULL REFERENCES teams(id),
    games_played  INTEGER NOT NULL,
    wins          INTEGER NOT NULL,
    draws         INTEGER NOT NULL,
    losses        INTEGER NOT NULL,
    goals_for     INTEGER NOT NULL,
    goals_against INTEGER NOT NULL,
    goal_diff     INTEGER NOT NULL,
    points        INTEGER NOT NULL,
    xg            REAL    NOT NULL,
    xga           REAL    NOT NULL,
    xgd           REAL    NOT NULL,
    live_rank     INTEGER NOT NULL,
    PRIMARY KEY (season_id, team_id, games_played)
);
CREATE INDEX idx_state_stream ON team_state(season_id, games_played);

CREATE TABLE season_pairs (
    id                 INTEGER PRIMARY KEY,
    prior_season_id    INTEGER NOT NULL REFERENCES seasons(id),
    current_season_id  INTEGER NOT NULL REFERENCES seasons(id),
    label              TEXT    NOT NULL UNIQUE,   -- '2016/17 -> 2017/18'
    common_team_count  INTEGER NOT NULL,
    UNIQUE (prior_season_id, current_season_id)
);

-- Teams present in both halves of a pair; promoted sides have no prior-season
-- Premier League record and are excluded from the fit, but are kept here with
-- in_pair = 0 so the UI can show them greyed out rather than silently dropping
-- three teams from the table.
CREATE TABLE pair_teams (
    pair_id    INTEGER NOT NULL REFERENCES season_pairs(id),
    team_id    INTEGER NOT NULL REFERENCES teams(id),
    in_pair    INTEGER NOT NULL,
    final_rank INTEGER,
    PRIMARY KEY (pair_id, team_id)
);

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- Bumped on logout; a refresh token carries the version it was issued
    -- under, so this is what makes logout actually revoke a stolen refresh
    -- token instead of just replacing it with an equally-valid new one.
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE saved_scenarios (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    params     TEXT NOT NULL,                       -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
);
CREATE INDEX idx_scenarios_user ON saved_scenarios(user_id);

-- Understat's own player id is stable across seasons (spot-checked: Salah is
-- id 1250 in both the 2023 and 2024 files), so it -- not a surrogate -- is
-- the key here alongside season_id.
--
-- team_id is NULL for a player who moved clubs mid-season: Understat reports
-- one row for them with team_title comma-separated ("Aston Villa,Manchester
-- United", 97 rows / 2.0% of 4,806 player-seasons) and totals aggregated
-- across both clubs with no way to split them back apart. Rather than
-- silently attribute that row to either club, it is excluded from every
-- per-club roster/aggregate (a plain `WHERE team_id = ?` already does this
-- for free) -- see CLAUDE.md "4a. ETL" for why this side was picked over
-- attributing to the first-listed club.
CREATE TABLE players (
    season_id    INTEGER NOT NULL REFERENCES seasons(id),
    player_id    INTEGER NOT NULL,
    name         TEXT    NOT NULL,
    team_id      INTEGER REFERENCES teams(id),
    position     TEXT    NOT NULL,
    games        INTEGER NOT NULL,
    minutes      INTEGER NOT NULL,
    goals        INTEGER NOT NULL,
    xg           REAL    NOT NULL,
    assists      INTEGER NOT NULL,
    xa           REAL    NOT NULL,
    shots        INTEGER NOT NULL,
    key_passes   INTEGER NOT NULL,
    npg          INTEGER NOT NULL,
    npxg         REAL    NOT NULL,
    xg_chain     REAL    NOT NULL,
    xg_buildup   REAL    NOT NULL,
    yellow_cards INTEGER NOT NULL,
    red_cards    INTEGER NOT NULL,
    PRIMARY KEY (season_id, player_id)
);
CREATE INDEX idx_players_team ON players(season_id, team_id);
"""


def season_label(start_year: int) -> str:
    return f"{start_year}/{str(start_year + 1)[-2:]}"


def read_matches(raw_dir: str) -> list[dict]:
    paths = sorted(glob.glob(os.path.join(raw_dir, "understat_EPL_*.csv")))
    if not paths:
        raise SystemExit(
            f"no match files in {raw_dir}/.\n"
            f"Run:  python3 scripts/fetch_understat.py\n"
            f"(that script needs plain internet access to understat.com)"
        )
    rows = []
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                rows.append(
                    {
                        "understat_id": int(r["match_id"]),
                        "season": int(r["season"]),
                        "played_at": r["datetime"],
                        "home_team": r["home_team"].strip(),
                        "away_team": r["away_team"].strip(),
                        "home_goals": int(r["home_goals"]),
                        "away_goals": int(r["away_goals"]),
                        "home_xg": float(r["home_xg"]),
                        "away_xg": float(r["away_xg"]),
                    }
                )
        print(f"  read {os.path.basename(path)}")
    return rows


_SEASON_FROM_JSON_NAME = re.compile(r"understat_EPL_(\d+)\.json$")


def read_players(raw_dir: str) -> list[dict]:
    """Reads the `players` array out of each season's raw JSON (not the CSV --
    the match exporter only carries match rows; the player payload Understat
    returns alongside it, 17 fields per player-season, lives only here)."""
    paths = sorted(glob.glob(os.path.join(raw_dir, "understat_EPL_*.json")))
    if not paths:
        raise SystemExit(
            f"no player files in {raw_dir}/.\n"
            f"Run:  python3 scripts/fetch_understat.py\n"
            f"(that script needs plain internet access to understat.com)"
        )
    rows = []
    for path in paths:
        season = int(_SEASON_FROM_JSON_NAME.search(os.path.basename(path)).group(1))
        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
        for p in payload["players"]:
            teams = p["team_title"].split(",")
            rows.append(
                {
                    "season": season,
                    "player_id": int(p["id"]),
                    "name": p["player_name"],
                    # None (never looked up against the teams table) for a
                    # mid-season transfer -- see the players table's own
                    # comment in SCHEMA for why.
                    "team": teams[0] if len(teams) == 1 else None,
                    "position": p["position"],
                    "games": int(p["games"]),
                    "minutes": int(p["time"]),
                    "goals": int(p["goals"]),
                    "xg": float(p["xG"]),
                    "assists": int(p["assists"]),
                    "xa": float(p["xA"]),
                    "shots": int(p["shots"]),
                    "key_passes": int(p["key_passes"]),
                    "npg": int(p["npg"]),
                    "npxg": float(p["npxG"]),
                    "xg_chain": float(p["xGChain"]),
                    "xg_buildup": float(p["xGBuildup"]),
                    "yellow_cards": int(p["yellow_cards"]),
                    "red_cards": int(p["red_cards"]),
                }
            )
        print(f"  read {os.path.basename(path)} ({len(payload['players'])} players)")
    return rows


def build_team_states(matches: list[dict]) -> list[dict]:
    """Walk each team's fixtures in order and record the table after every game."""
    per_team: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for m in matches:
        for side, opponent_side in (("home", "away"), ("away", "home")):
            per_team[(m["season"], m[f"{side}_team"])].append(
                {
                    "played_at": m["played_at"],
                    "gf": m[f"{side}_goals"],
                    "ga": m[f"{opponent_side}_goals"],
                    "xg": m[f"{side}_xg"],
                    "xga": m[f"{opponent_side}_xg"],
                }
            )

    states: list[dict] = []
    for (season, team), fixtures in per_team.items():
        fixtures.sort(key=lambda f: f["played_at"])
        w = d = l = gf = ga = pts = 0
        xg = xga = 0.0
        for n, f in enumerate(fixtures, start=1):
            gf += f["gf"]
            ga += f["ga"]
            xg += f["xg"]
            xga += f["xga"]
            if f["gf"] > f["ga"]:
                w += 1
                pts += 3
            elif f["gf"] == f["ga"]:
                d += 1
                pts += 1
            else:
                l += 1
            states.append(
                {
                    "season": season,
                    "team": team,
                    "games_played": n,
                    "wins": w,
                    "draws": d,
                    "losses": l,
                    "goals_for": gf,
                    "goals_against": ga,
                    "goal_diff": gf - ga,
                    "points": pts,
                    "xg": round(xg, 5),
                    "xga": round(xga, 5),
                    "xgd": round(xg - xga, 5),
                }
            )

    # Rank within (season, games_played) using the league's own tiebreakers:
    # points, then goal difference, then goals scored, then name.
    by_slice: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for s in states:
        by_slice[(s["season"], s["games_played"])].append(s)
    for group in by_slice.values():
        group.sort(key=lambda s: (-s["points"], -s["goal_diff"], -s["goals_for"], s["team"]))
        for rank, s in enumerate(group, start=1):
            s["live_rank"] = rank

    return states


def build(raw_dir: str, db_path: str) -> None:
    print(f"reading {raw_dir}/")
    matches = read_matches(raw_dir)
    print(f"  {len(matches)} matches total")

    players = read_players(raw_dir)
    multi_club = sum(1 for p in players if p["team"] is None)
    print(f"  {len(players)} player-seasons total ({multi_club} mid-season transfers, excluded from every club)")

    states = build_team_states(matches)
    print(f"  {len(states)} team-state rows")

    seasons = sorted({m["season"] for m in matches})
    teams = sorted({m["home_team"] for m in matches} | {m["away_team"] for m in matches})

    if os.path.exists(db_path):
        os.remove(db_path)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)

    con.executemany("INSERT INTO teams (name) VALUES (?)", [(t,) for t in teams])
    con.executemany(
        "INSERT INTO seasons (start_year, label) VALUES (?, ?)",
        [(y, season_label(y)) for y in seasons],
    )
    team_id = dict(con.execute("SELECT name, id FROM teams"))
    season_id = dict(con.execute("SELECT start_year, id FROM seasons"))

    con.executemany(
        """INSERT INTO matches
           (understat_id, season_id, played_at, home_team_id, away_team_id,
            home_goals, away_goals, home_xg, away_xg)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            (
                m["understat_id"],
                season_id[m["season"]],
                m["played_at"],
                team_id[m["home_team"]],
                team_id[m["away_team"]],
                m["home_goals"],
                m["away_goals"],
                m["home_xg"],
                m["away_xg"],
            )
            for m in matches
        ],
    )

    con.executemany(
        """INSERT INTO team_state
           (season_id, team_id, games_played, wins, draws, losses, goals_for,
            goals_against, goal_diff, points, xg, xga, xgd, live_rank)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            (
                season_id[s["season"]],
                team_id[s["team"]],
                s["games_played"],
                s["wins"],
                s["draws"],
                s["losses"],
                s["goals_for"],
                s["goals_against"],
                s["goal_diff"],
                s["points"],
                s["xg"],
                s["xga"],
                s["xgd"],
                s["live_rank"],
            )
            for s in states
        ],
    )

    unmatched_team = {p["team"] for p in players if p["team"] is not None} - set(team_id)
    if unmatched_team:
        print(f"  ! player rows reference teams absent from the matches table: {unmatched_team}", file=sys.stderr)

    con.executemany(
        """INSERT INTO players
           (season_id, player_id, name, team_id, position, games, minutes, goals,
            xg, assists, xa, shots, key_passes, npg, npxg, xg_chain, xg_buildup,
            yellow_cards, red_cards)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            (
                season_id[p["season"]],
                p["player_id"],
                p["name"],
                team_id.get(p["team"]) if p["team"] is not None else None,
                p["position"],
                p["games"],
                p["minutes"],
                p["goals"],
                p["xg"],
                p["assists"],
                p["xa"],
                p["shots"],
                p["key_passes"],
                p["npg"],
                p["npxg"],
                p["xg_chain"],
                p["xg_buildup"],
                p["yellow_cards"],
                p["red_cards"],
            )
            for p in players
        ],
    )

    # Season pairs: consecutive seasons, with the teams that appear in both.
    teams_by_season = defaultdict(set)
    for m in matches:
        teams_by_season[m["season"]].add(m["home_team"])

    final_rank = {
        (s["season"], s["team"]): s["live_rank"]
        for s in states
        if s["games_played"] == SEASON_LENGTH
    }

    for prior, current in zip(seasons, seasons[1:]):
        common = teams_by_season[prior] & teams_by_season[current]
        label = f"{season_label(prior)} -> {season_label(current)}"
        cur = con.execute(
            """INSERT INTO season_pairs
               (prior_season_id, current_season_id, label, common_team_count)
               VALUES (?,?,?,?)""",
            (season_id[prior], season_id[current], label, len(common)),
        )
        pair_id = cur.lastrowid
        con.executemany(
            "INSERT INTO pair_teams (pair_id, team_id, in_pair, final_rank) VALUES (?,?,?,?)",
            [
                (pair_id, team_id[t], int(t in common), final_rank.get((current, t)))
                for t in sorted(teams_by_season[current])
            ],
        )
        print(f"  pair {label}: {len(common)} common teams")

    con.commit()

    print("\nsanity checks")
    checks = {
        "seasons": "SELECT COUNT(*) FROM seasons",
        "teams": "SELECT COUNT(*) FROM teams",
        "matches": "SELECT COUNT(*) FROM matches",
        "team_state rows": "SELECT COUNT(*) FROM team_state",
        "player-seasons": "SELECT COUNT(*) FROM players",
        "season pairs": "SELECT COUNT(*) FROM season_pairs",
    }
    for label, sql in checks.items():
        print(f"  {label:<16} {con.execute(sql).fetchone()[0]}")

    incomplete = con.execute(
        """SELECT s.label, COUNT(*) FROM team_state ts
           JOIN seasons s ON s.id = ts.season_id
           WHERE ts.games_played = ?
           GROUP BY s.label HAVING COUNT(*) <> 20""",
        (SEASON_LENGTH,),
    ).fetchall()
    if incomplete:
        print(f"  ! seasons without 20 teams on {SEASON_LENGTH} games: {incomplete}", file=sys.stderr)
    else:
        print(f"  every season has 20 teams reaching {SEASON_LENGTH} games")

    con.close()
    size = os.path.getsize(db_path) / 1024
    print(f"\nwrote {db_path} ({size:.0f} KB)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", default="data/raw")
    parser.add_argument("--db", default="data/pl.db")
    args = parser.parse_args()
    build(args.raw, args.db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
