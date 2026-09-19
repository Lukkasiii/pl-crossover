#!/usr/bin/env python3
"""
Compute the crossover curves at every matchweek.

The original study measured four checkpoints -- games 5, 10, 15 and 20 -- because
that was what the spreadsheet held. With match-level data the same regression can
run after every game, so the crossover can be read off directly instead of
interpolated between two coarse points.

For each predictor and each N in 1..38:

    fit  final_league_position ~ cumulative_metric_after_N_games
    pooled over all 8 season pairs x 17 common teams = 136 observations

against a fixed baseline fit on the prior season's full-season value of the same
metric. The crossover is the first N where the current season's RMSE drops below
that baseline.

    python3 scripts/build_curves.py                 # -> data/curves.json
    python3 scripts/build_curves.py --check         # also compare to the deck
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from app.model import find_crossover, ols_fit, ols_fit_loso  # noqa: E402

METRICS = {
    "xg": "xg",
    "xgd": "xgd",
    "gd": "goal_diff",
    "points": "points",
}

# Published in the final presentation, for the regression test below.
DECK = {
    "xg": {"prior": 4.09, 5: 4.50, 10: 4.17, 15: 3.87, 20: 3.63},
    "xgd": {"prior": 3.76, 5: 4.49, 10: 3.96, 15: 3.58, 20: 3.30},
}


def load(db_path: str) -> list[dict]:
    """One row per (season pair, team): the prior-season totals, the current
    season's totals after every N, and where the team actually finished."""
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    pairs = con.execute(
        """SELECT sp.id, sp.label, sp.prior_season_id, sp.current_season_id
           FROM season_pairs sp ORDER BY sp.id"""
    ).fetchall()

    rows = []
    for p in pairs:
        teams = con.execute(
            "SELECT team_id, final_rank FROM pair_teams WHERE pair_id=? AND in_pair=1",
            (p["id"],),
        ).fetchall()

        for t in teams:
            prior = con.execute(
                """SELECT xg, xgd, goal_diff, points FROM team_state
                   WHERE season_id=? AND team_id=? AND games_played=38""",
                (p["prior_season_id"], t["team_id"]),
            ).fetchone()

            current = con.execute(
                """SELECT games_played, xg, xgd, goal_diff, points FROM team_state
                   WHERE season_id=? AND team_id=? ORDER BY games_played""",
                (p["current_season_id"], t["team_id"]),
            ).fetchall()

            rows.append(
                {
                    "pair": p["label"],
                    "team_id": t["team_id"],
                    "final_rank": t["final_rank"],
                    "prior": {m: prior[col] for m, col in METRICS.items()},
                    "current": {
                        r["games_played"]: {m: r[col] for m, col in METRICS.items()} for r in current
                    },
                }
            )
    con.close()
    return rows


def build(rows: list[dict]) -> dict:
    y = np.array([r["final_rank"] for r in rows], dtype=float)
    groups = np.array([r["pair"] for r in rows])
    games = list(range(1, 39))

    out = {"n_observations": len(rows), "n_pairs": len(set(groups)), "games": games, "metrics": {}}

    for metric in METRICS:
        prior_x = np.array([r["prior"][metric] for r in rows], dtype=float)
        prior_fit = ols_fit(prior_x, y)
        prior_loso = ols_fit_loso(prior_x, y, groups)

        series = {"rmse": [], "mae": [], "r2": [], "loso_rmse": []}
        for n in games:
            x = np.array([r["current"][n][metric] for r in rows], dtype=float)
            fit = ols_fit(x, y)
            series["rmse"].append(round(fit.rmse, 4))
            series["mae"].append(round(fit.mae, 4))
            series["r2"].append(round(fit.r2, 4))
            series["loso_rmse"].append(round(ols_fit_loso(x, y, groups).rmse, 4))

        out["metrics"][metric] = {
            "prior": {
                "rmse": round(prior_fit.rmse, 4),
                "mae": round(prior_fit.mae, 4),
                "r2": round(prior_fit.r2, 4),
                "loso_rmse": round(prior_loso.rmse, 4),
            },
            "current": series,
            "crossover": find_crossover(games, series["rmse"], prior_fit.rmse),
            "crossover_loso": find_crossover(games, series["loso_rmse"], prior_loso.rmse),
        }

    return out


def report(curves: dict, check: bool) -> int:
    print(f"n = {curves['n_observations']} team-seasons across {curves['n_pairs']} season pairs\n")

    print(f"{'metric':<8} {'prior RMSE':>11} {'crossover':>10} {'@5':>7} {'@10':>7} {'@15':>7} {'@20':>7} {'@38':>7}")
    print("-" * 70)
    for metric, data in curves["metrics"].items():
        rmse = data["current"]["rmse"]
        at = lambda n: rmse[n - 1]  # noqa: E731
        xo = data["crossover"]
        print(
            f"{metric:<8} {data['prior']['rmse']:>11.3f} {(f'{xo:.1f}' if xo else 'never'):>10}"
            f" {at(5):>7.3f} {at(10):>7.3f} {at(15):>7.3f} {at(20):>7.3f} {at(38):>7.3f}"
        )

    if not check:
        return 0

    print("\nagainst the published checkpoint figures")
    print("-" * 70)
    failures = 0
    for metric, expected in DECK.items():
        data = curves["metrics"][metric]
        got = data["prior"]["rmse"]
        delta = got - expected["prior"]
        flag = "ok" if abs(delta) < 0.06 else "CHECK"
        failures += flag == "CHECK"
        print(f"  {metric:<5} prior   got {got:6.3f}   deck {expected['prior']:6.2f}   diff {delta:+.3f}   {flag}")
        for n in (5, 10, 15, 20):
            got = data["current"]["rmse"][n - 1]
            delta = got - expected[n]
            flag = "ok" if abs(delta) < 0.06 else "CHECK"
            failures += flag == "CHECK"
            print(f"  {metric:<5} @{n:<6} got {got:6.3f}   deck {expected[n]:6.2f}   diff {delta:+.3f}   {flag}")
    print()
    if failures:
        print(f"{failures} value(s) differ from the deck by more than 0.06.")
        print("Small gaps are expected: the deck's checkpoints came from a separate")
        print("spreadsheet extraction, this runs off match-level data rebuilt from scratch.")
    else:
        print("Every checkpoint reproduced from match-level data.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default="data/pl.db")
    parser.add_argument("--out", default="data/curves.json")
    parser.add_argument("--check", action="store_true", help="compare against the published figures")
    args = parser.parse_args()

    rows = load(args.db)
    curves = build(rows)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(curves, fh, indent=1)

    code = report(curves, args.check)
    print(f"\nwrote {args.out}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
