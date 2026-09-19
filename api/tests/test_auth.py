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


def test_logout_requires_a_token(client):
    assert client.post("/auth/logout").status_code == 401


def test_logout_revokes_the_refresh_token(client):
    client.post("/auth/register", json={"email": "logout@example.com", "password": "hunter22"})
    login = client.post("/auth/login", json={"email": "logout@example.com", "password": "hunter22"})
    access = login.json()["access_token"]
    stolen_refresh = login.cookies["refresh_token"]

    r = client.post("/auth/logout", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 204

    # The client's own cookie jar drops the now-expired cookie on its own;
    # resend the old value explicitly to prove the *server* rejects it too,
    # not just that the browser stopped sending it.
    client.cookies.set("refresh_token", stolen_refresh)
    r = client.post("/auth/refresh")
    assert r.status_code == 401


def test_logout_does_not_revoke_other_users_sessions(client, second_client):
    """Alice and Bob use separate browsers (separate cookie jars); logging Alice
    out must bump only Alice's token_version, not Bob's."""
    client.post("/auth/register", json={"email": "alice@example.com", "password": "hunter22"})
    client.post("/auth/register", json={"email": "bob@example.com", "password": "hunter22"})
    alice = client.post("/auth/login", json={"email": "alice@example.com", "password": "hunter22"}).json()
    second_client.post("/auth/login", json={"email": "bob@example.com", "password": "hunter22"})

    client.post("/auth/logout", headers={"Authorization": f"Bearer {alice['access_token']}"})

    assert client.post("/auth/refresh").status_code == 401  # alice: revoked
    assert second_client.post("/auth/refresh").status_code == 200  # bob: untouched


def test_login_gives_the_same_error_for_missing_user_and_wrong_password(client):
    """The response must not reveal whether the email is registered at all."""
    client.post("/auth/register", json={"email": "timing@example.com", "password": "hunter22"})
    missing = client.post("/auth/login", json={"email": "nobody@example.com", "password": "hunter22"})
    wrong = client.post("/auth/login", json={"email": "timing@example.com", "password": "wrong1234"})
    assert missing.status_code == wrong.status_code == 401
    assert missing.json()["detail"] == wrong.json()["detail"]
