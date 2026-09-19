from __future__ import annotations


def test_table_at_n_games_is_a_full_ranking(client):
    r = client.get("/api/pairs/1/table?games=10")
    assert r.status_code == 200
    body = r.json()
    assert body["pair_id"] == 1
    assert body["games"] == 10
    rows = body["rows"]
    assert len(rows) == 20
    assert sorted(row["live_rank"] for row in rows) == list(range(1, 21))
    assert all(row["games_played"] == 10 for row in rows)
    assert all(row["in_pair"] is True for row in rows)  # synthetic seasons share the full roster
    assert all(row["final_rank"] is not None for row in rows)


def test_games_out_of_range_is_rejected(client):
    assert client.get("/api/pairs/1/table?games=0").status_code == 422
    assert client.get("/api/pairs/1/table?games=39").status_code == 422


def test_unknown_pair_is_404(client):
    r = client.get("/api/pairs/999/table?games=10")
    assert r.status_code == 404
