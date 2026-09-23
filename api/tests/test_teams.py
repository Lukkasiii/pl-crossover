from __future__ import annotations


def test_every_team_appears_with_full_history(client):
    r = client.get("/api/team-seasons")
    assert r.status_code == 200
    body = r.json()
    teams = body["teams"]
    # The synthetic fixture (see factory.py) uses the same 20-team roster in
    # every season, so every team appears in both pairs the fixture builds.
    assert len(teams) == 20
    assert all(len(t["seasons"]) == 2 for t in teams)


def test_team_season_shape_and_rank_by_game(client):
    r = client.get("/api/team-seasons")
    team_a = next(t for t in r.json()["teams"] if t["name"] == "Team A")
    assert team_a["slug"] == "team-a"

    season = team_a["seasons"][0]
    assert season["pairId"] == 1
    assert season["season"] == "2017/18"
    assert season["inPair"] is True
    assert len(season["rankByGame"]) == 38
    assert all(1 <= r <= 20 for r in season["rankByGame"])
    assert 1 <= season["finalRank"] <= 20
    # live_rank at games_played=38 (the last entry) is what final_rank is derived from.
    assert season["rankByGame"][-1] == season["finalRank"]


def test_unknown_query_params_are_ignored_not_erroring(client):
    # GET /api/team-seasons takes no query params -- this just documents
    # that the endpoint doesn't 422 on a stray one from an old link.
    assert client.get("/api/team-seasons?foo=bar").status_code == 200
