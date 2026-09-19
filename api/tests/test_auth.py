from __future__ import annotations


def test_register_and_login_round_trip(client):
    r = client.post("/auth/register", json={"email": "demo@example.com", "password": "hunter22"})
    assert r.status_code == 201
    assert r.json()["email"] == "demo@example.com"

    r = client.post("/auth/login", json={"email": "demo@example.com", "password": "hunter22"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert "refresh_token" in r.cookies


def test_duplicate_registration_is_rejected(client):
    client.post("/auth/register", json={"email": "dup@example.com", "password": "hunter22"})
    r = client.post("/auth/register", json={"email": "dup@example.com", "password": "hunter22"})
    assert r.status_code == 409


def test_login_with_wrong_password_fails(client):
    client.post("/auth/register", json={"email": "wrong@example.com", "password": "hunter22"})
    r = client.post("/auth/login", json={"email": "wrong@example.com", "password": "nope1234"})
    assert r.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401

    client.post("/auth/register", json={"email": "me@example.com", "password": "hunter22"})
    login = client.post("/auth/login", json={"email": "me@example.com", "password": "hunter22"})
    access = login.json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200
    assert r.json()["email"] == "me@example.com"


def test_refresh_issues_a_usable_access_token(client):
    client.post("/auth/register", json={"email": "refresh@example.com", "password": "hunter22"})
    client.post("/auth/login", json={"email": "refresh@example.com", "password": "hunter22"})

    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    new_access = refreshed.json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert r.status_code == 200
    assert r.json()["email"] == "refresh@example.com"


def test_refresh_without_cookie_fails(client):
    assert client.post("/auth/refresh").status_code == 401
