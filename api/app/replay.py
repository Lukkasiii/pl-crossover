"""Builds the replay's 418-frame snapshot list for one season pair.

Every frame is a full snapshot (never a delta) so a `seek` command can jump to
any point without replaying history. The list is built once per (db, pair)
and cached for the process lifetime; `routers/replay.py` only runs the
play/pause/seek loop over it.
"""

from __future__ import annotations

import sqlite3

from .analytics import METRIC_COLUMNS, get_curve
from .model import bayes_weights

FULL_SEASON_GAMES = 38


def _table_snapshot(games_played: dict[int, int], team_state: dict, roster: dict, pair_teams: dict) -> list[dict]:
    started, not_started = [], []
    for team_id, name in roster.items():
        gp = games_played[team_id]
        info = pair_teams[team_id]
        if gp == 0:
            row = {
                "team_id": team_id,
                "name": name,
                "games_played": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "goals_for": 0,
                "goals_against": 0,
                "goal_diff": 0,
                "points": 0,
                "xg": 0.0,
                "xga": 0.0,
                "xgd": 0.0,
                "live_rank": None,
            }
            row["in_pair"] = bool(info["in_pair"])
            row["final_rank"] = info["final_rank"]
            not_started.append(row)
        else:
            st = team_state[(team_id, gp)]
            row = {
                "team_id": team_id,
                "name": name,
                "games_played": gp,
                "wins": st["wins"],
                "draws": st["draws"],
                "losses": st["losses"],
                "goals_for": st["goals_for"],
                "goals_against": st["goals_against"],
                "goal_diff": st["goal_diff"],
                "points": st["points"],
                "xg": st["xg"],
                "xga": st["xga"],
                "xgd": st["xgd"],
            }
            row["in_pair"] = bool(info["in_pair"])
            row["final_rank"] = info["final_rank"]
            started.append(row)

    # st["live_rank"] is only valid within teams sharing the same games_played
    # (that is how build_db.py computed it). A match frame mixes teams at
    # different counts whenever a postponement has put them out of step, so
    # reusing that stored value here would compare ranks from unrelated
    # permutations. Recompute fresh, across whoever has actually kicked off,
    # with the league's own tiebreakers: points, goal diff, goals scored, name.
    started.sort(key=lambda r: (-r["points"], -r["goal_diff"], -r["goals_for"], r["name"]))
    for rank, row in enumerate(started, start=1):
        row["live_rank"] = rank

    return started + not_started


def _round_frame(con: sqlite3.Connection, db_path: str, games: int) -> dict:
    metrics = {}
    for metric in METRIC_COLUMNS:
        curve = get_curve(con, db_path, metric, "pooled")
        cur = curve["current"][games - 1]
        metrics[metric] = {
            "rmse": cur.rmse,
            "mae": cur.mae,
            "r2": cur.r2,
            "prior_rmse": curve["prior"].rmse,
            "crossover_passed": curve["crossover"] is not None and games >= curve["crossover"],
        }
    w_prior, w_data = bayes_weights(games)
    return {"games": games, "weights": {"prior": w_prior, "data": w_data}, "metrics": metrics}


def build_frames(con: sqlite3.Connection, db_path: str, pair_id: int) -> list[dict] | None:
    pair = con.execute("SELECT current_season_id FROM season_pairs WHERE id = ?", (pair_id,)).fetchone()
    if pair is None:
        return None
    current_season_id = pair["current_season_id"]

    roster = {
        r["team_id"]: r["name"]
        for r in con.execute(
            """SELECT pt.team_id, t.name FROM pair_teams pt JOIN teams t ON t.id = pt.team_id
               WHERE pt.pair_id = ?""",
            (pair_id,),
        )
    }
    pair_teams = {
        r["team_id"]: {"in_pair": r["in_pair"], "final_rank": r["final_rank"]}
        for r in con.execute("SELECT team_id, in_pair, final_rank FROM pair_teams WHERE pair_id = ?", (pair_id,))
    }
    team_state = {
        (r["team_id"], r["games_played"]): r
        for r in con.execute(
            """SELECT team_id, games_played, wins, draws, losses, goals_for, goals_against,
                      goal_diff, points, xg, xga, xgd, live_rank
               FROM team_state WHERE season_id = ?""",
            (current_season_id,),
        )
    }
    matches = con.execute(
        "SELECT home_team_id, away_team_id, played_at FROM matches WHERE season_id = ? ORDER BY played_at, id",
        (current_season_id,),
    ).fetchall()

    games_played = dict.fromkeys(roster, 0)
    frames: list[dict] = []
    seq = 0
    last_round = 0

    for match_number, m in enumerate(matches, start=1):
        games_played[m["home_team_id"]] += 1
        games_played[m["away_team_id"]] += 1
        frames.append(
            {
                "seq": seq,
                "type": "match",
                "match_number": match_number,
                "played_at": m["played_at"].replace(" ", "T"),
                "table": _table_snapshot(games_played, team_state, roster, pair_teams),
            }
        )
        seq += 1

        current_round = min(games_played.values())
        while last_round < current_round and last_round < FULL_SEASON_GAMES:
            last_round += 1
            frame = _round_frame(con, db_path, last_round)
            frame["seq"] = seq
            frame["type"] = "round"
            frames.append(frame)
            seq += 1

    return frames


_frame_cache: dict[tuple[str, int], list[dict]] = {}


def get_frames(con: sqlite3.Connection, db_path: str, pair_id: int) -> list[dict] | None:
    key = (db_path, pair_id)
    if key not in _frame_cache:
        frames = build_frames(con, db_path, pair_id)
        if frames is None:
            return None
        _frame_cache[key] = frames
    return _frame_cache[key]
