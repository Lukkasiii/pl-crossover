from __future__ import annotations

import pytest


def test_pooled_curve_shape(client):
    r = client.get("/api/curves?metric=xg&method=pooled")
    assert r.status_code == 200
    body = r.json()
    assert body["n_pairs"] == 2
    assert body["n_observations"] == 40  # 2 pairs x 20 common teams
    assert body["games"] == list(range(1, 39))
    assert len(body["current_rmse"]) == 38
    assert len(body["loso_rmse"]) == 38
    # LOSO error should not be dramatically better than in-sample on the same data.
    assert body["loso_rmse"][-1] >= body["current_rmse"][-1] - 1e-6


def test_per_season_curve_has_no_loso(client):
    r = client.get("/api/curves?metric=points&method=per_season")
    assert r.status_code == 200
    body = r.json()
    assert body["loso_rmse"] is None
    assert body["crossover_loso"] is None
    assert len(body["current_rmse"]) == 38


@pytest.mark.parametrize("metric", ["xg", "xgd", "gd", "points"])
def test_all_metrics_accepted(client, metric):
    assert client.get(f"/api/curves?metric={metric}").status_code == 200


def test_bad_metric_is_rejected(client):
    assert client.get("/api/curves?metric=bogus").status_code == 422


def test_bad_method_is_rejected(client):
    assert client.get("/api/curves?metric=xg&method=bogus").status_code == 422
