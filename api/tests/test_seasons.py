from __future__ import annotations


def test_lists_both_pairs(client):
    r = client.get("/api/seasons")
    assert r.status_code == 200
    pairs = r.json()
    assert len(pairs) == 2
    assert [p["label"] for p in pairs] == ["2016/17 -> 2017/18", "2017/18 -> 2018/19"]
    assert all(p["common_team_count"] == 20 for p in pairs)
    assert all(p["season_start"] < p["season_end"] for p in pairs)
