from __future__ import annotations

import pytest


@pytest.fixture()
def auth_header(client):
    client.post("/auth/register", json={"email": "scenarios@example.com", "password": "hunter22"})
    login = client.post("/auth/login", json={"email": "scenarios@example.com", "password": "hunter22"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_crud_round_trip(client, auth_header):
    body = {"name": "aggressive prior", "params": {"metric": "xg", "prior_weight": 8.0, "obs_variance": 1.5}}
    r = client.post("/api/scenarios", json=body, headers=auth_header)
    assert r.status_code == 201
    scenario = r.json()
    assert scenario["params"]["method"] == "pooled"  # default fills in

    r = client.get("/api/scenarios", headers=auth_header)
    assert [s["name"] for s in r.json()] == ["aggressive prior"]

    r = client.put(
        f"/api/scenarios/{scenario['id']}",
        json={"name": "renamed"},
        headers=auth_header,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "renamed"
    assert r.json()["params"]["metric"] == "xg"  # untouched fields survive a partial update

    r = client.delete(f"/api/scenarios/{scenario['id']}", headers=auth_header)
    assert r.status_code == 204
    assert client.get("/api/scenarios", headers=auth_header).json() == []


def test_unauthenticated_access_is_rejected(client):
    assert client.get("/api/scenarios").status_code == 401
    assert client.post("/api/scenarios", json={"name": "x", "params": {"metric": "xg"}}).status_code == 401


def test_cannot_access_another_users_scenario(client):
    client.post("/auth/register", json={"email": "owner@example.com", "password": "hunter22"})
    owner_login = client.post("/auth/login", json={"email": "owner@example.com", "password": "hunter22"})
    owner_header = {"Authorization": f"Bearer {owner_login.json()['access_token']}"}
    created = client.post(
        "/api/scenarios",
        json={"name": "mine", "params": {"metric": "gd"}},
        headers=owner_header,
    ).json()

    client.post("/auth/register", json={"email": "other@example.com", "password": "hunter22"})
    other_login = client.post("/auth/login", json={"email": "other@example.com", "password": "hunter22"})
    other_header = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

    assert client.get("/api/scenarios", headers=other_header).json() == []
    assert client.delete(f"/api/scenarios/{created['id']}", headers=other_header).status_code == 404
    assert client.put(f"/api/scenarios/{created['id']}", json={"name": "stolen"}, headers=other_header).status_code == 404
