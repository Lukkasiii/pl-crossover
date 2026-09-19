"""
End-to-end test of the ETL on synthetic fixtures.

Generates two complete 20-team seasons with a deterministic RNG, runs the real
build_db pipeline over them, and asserts the resulting database is internally
consistent. Nothing here touches data/raw -- fixtures are written to a tmp dir
so test runs can never be mistaken for real Understat output.

    python3 -m pytest api/tests -q
"""

from __future__ import annotations

import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "api"))
sys.path.insert(0, os.path.dirname(__file__))

from app.model import bayes_weights, find_crossover, ols_fit, ols_fit_loso  # noqa: E402
from factory import build_synthetic_db, connect  # noqa: E402


@pytest.fixture(scope="module")
def db(tmp_path_factory):
    db_path = build_synthetic_db(tmp_path_factory, seasons=(2016, 2017))
    con = connect(db_path)
    yield con
    con.close()


# --- ETL ------------------------------------------------------------------


def test_match_and_state_counts(db):
    assert db.execute("SELECT COUNT(*) FROM matches").fetchone()[0] == 760
    # 2 seasons x 20 teams x 38 games
    assert db.execute("SELECT COUNT(*) FROM team_state").fetchone()[0] == 1520


def test_every_team_reaches_38_games(db):
    rows = db.execute(
        "SELECT season_id, COUNT(*) c FROM team_state WHERE games_played = 38 GROUP BY season_id"
    ).fetchall()
    assert [r["c"] for r in rows] == [20, 20]


def test_points_match_results(db):
    """Final points must equal 3*W + 1*D, and W+D+L must equal games played."""
    bad = db.execute(
        """SELECT COUNT(*) FROM team_state
           WHERE points <> wins * 3 + draws
              OR wins + draws + losses <> games_played"""
    ).fetchone()[0]
    assert bad == 0


def test_goal_diff_is_consistent(db):
    bad = db.execute(
        "SELECT COUNT(*) FROM team_state WHERE goal_diff <> goals_for - goals_against"
    ).fetchone()[0]
    assert bad == 0


def test_cumulative_stats_are_monotonic(db):
    """Goals and xG accumulate; they can never decrease game to game."""
    rows = db.execute(
        """SELECT team_id, season_id, games_played, goals_for, xg
           FROM team_state ORDER BY season_id, team_id, games_played"""
    ).fetchall()
    prev = {}
    for r in rows:
        key = (r["season_id"], r["team_id"])
        if key in prev:
            assert r["goals_for"] >= prev[key][0]
            assert r["xg"] >= prev[key][1] - 1e-9
        prev[key] = (r["goals_for"], r["xg"])


def test_live_rank_is_a_permutation(db):
    """Within one (season, games_played) slice, ranks must be exactly 1..20."""
    slices = db.execute(
        "SELECT DISTINCT season_id, games_played FROM team_state"
    ).fetchall()
    for s in slices:
        ranks = [
            r[0]
            for r in db.execute(
                "SELECT live_rank FROM team_state WHERE season_id=? AND games_played=?",
                (s["season_id"], s["games_played"]),
            )
        ]
        assert sorted(ranks) == list(range(1, 21))


def test_league_totals_balance(db):
    """Goals scored across the league must equal goals conceded."""
    row = db.execute(
        "SELECT SUM(goals_for), SUM(goals_against) FROM team_state WHERE games_played = 38"
    ).fetchone()
    assert row[0] == row[1]


def test_season_pair_created(db):
    pairs = db.execute("SELECT * FROM season_pairs").fetchall()
    assert len(pairs) == 1
    assert pairs[0]["common_team_count"] == 20
    assert pairs[0]["label"] == "2016/17 -> 2017/18"


def test_auth_tables_exist(db):
    names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "saved_scenarios"} <= names


# --- model ----------------------------------------------------------------


def test_ols_recovers_a_known_line():
    import numpy as np

    x = np.arange(20, dtype=float)
    y = 3.0 + 2.0 * x
    fit = ols_fit(x, y)
    assert fit.slope == pytest.approx(2.0)
    assert fit.intercept == pytest.approx(3.0)
    assert fit.rmse == pytest.approx(0.0, abs=1e-9)
    assert fit.r2 == pytest.approx(1.0)


def test_ols_rejects_degenerate_input():
    import numpy as np

    with pytest.raises(ValueError):
        ols_fit(np.ones(10), np.arange(10.0))
    with pytest.raises(ValueError):
        ols_fit(np.arange(2.0), np.arange(2.0))


def test_loso_is_not_better_than_in_sample():
    """Held-out error should be >= in-sample error on noisy data."""
    import numpy as np

    rng = np.random.default_rng(7)
    groups = np.repeat(np.arange(8), 17)
    x = rng.normal(size=136)
    y = 2 * x + rng.normal(scale=2.0, size=136)
    assert ols_fit_loso(x, y, groups).rmse >= ols_fit(x, y).rmse


def test_bayes_weights_shift_from_prior_to_data():
    shares = []
    for n in (5, 10, 15, 20):
        w_prior, w_data = bayes_weights(n)
        shares.append(w_prior / (w_prior + w_data))
    # Published prior shares: 60%, 43%, 33%, 27%
    assert [round(s * 100) for s in shares] == [60, 43, 33, 27]
    assert shares == sorted(shares, reverse=True)


def test_crossover_interpolates():
    games = [5, 10, 15, 20]
    # prior RMSE 4.0; current crosses between 10 (4.2) and 15 (3.8)
    assert find_crossover(games, [4.6, 4.2, 3.8, 3.5], 4.0) == pytest.approx(12.5)
    assert find_crossover(games, [4.6, 4.5, 4.4, 4.3], 4.0) is None
    assert find_crossover(games, [3.9, 3.8, 3.7, 3.6], 4.0) == 5.0
