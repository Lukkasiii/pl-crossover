from __future__ import annotations


def test_predict_returns_a_blend(client):
    r = client.post("/api/predict", json={"metric": "xg", "games": 10})
    assert r.status_code == 200
    body = r.json()
    assert body["weight_prior"] == 5.0
    assert body["weight_data"] == 10 / 1.5
    assert body["blended_rmse"] > 0
    assert body["prior"]["n"] == body["current"]["n"] == 40


def test_custom_prior_weight_changes_the_blend(client):
    low = client.post("/api/predict", json={"metric": "xg", "games": 10, "prior_weight": 0.01}).json()
    high = client.post("/api/predict", json={"metric": "xg", "games": 10, "prior_weight": 50}).json()
    assert low["blended_rmse"] != high["blended_rmse"]


def test_games_out_of_range_is_rejected(client):
    assert client.post("/api/predict", json={"metric": "xg", "games": 0}).status_code == 422
    assert client.post("/api/predict", json={"metric": "xg", "games": 39}).status_code == 422


def test_negative_obs_variance_is_rejected(client):
    r = client.post("/api/predict", json={"metric": "xg", "games": 10, "obs_variance": -1})
    assert r.status_code == 422
