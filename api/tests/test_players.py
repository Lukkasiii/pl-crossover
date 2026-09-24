from __future__ import annotations


def test_team_players_shape(client):
    team_id = client.get("/api/team-seasons").json()["teams"][0]["id"]
    r = client.get(f"/api/team-players?pair_id=1&team_id={team_id}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["players"]) >= 18  # factory.py writes 18-24 per team
    assert isinstance(body["excludedMidSeasonTransfers"], int)
    p = body["players"][0]
    assert p["goals"] >= p["npg"]
    assert p["xg"] >= p["npxg"] - 1e-6
    assert p["minutes"] <= 38 * 90


def test_team_players_sorted_by_minutes_descending(client):
    team_id = client.get("/api/team-seasons").json()["teams"][0]["id"]
    r = client.get(f"/api/team-players?pair_id=1&team_id={team_id}")
    minutes = [p["minutes"] for p in r.json()["players"]]
    assert minutes == sorted(minutes, reverse=True)


def test_excluded_count_matches_the_two_synthetic_transfers(client):
    team_id = client.get("/api/team-seasons").json()["teams"][0]["id"]
    r = client.get(f"/api/team-players?pair_id=1&team_id={team_id}")
    assert r.json()["excludedMidSeasonTransfers"] == 2


def test_unknown_pair_returns_an_empty_squad_not_an_error(client):
    r = client.get("/api/team-players?pair_id=999&team_id=1")
    assert r.status_code == 200
    assert r.json() == {"players": [], "excludedMidSeasonTransfers": 0}
