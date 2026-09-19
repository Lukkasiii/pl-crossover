"""Access token in the response body, refresh token in an httpOnly cookie.

The access token never touches storage the client controls beyond memory, so
an XSS payload that can run JS still cannot read it out of localStorage --
there is nothing there to read. The refresh cookie is scoped to /auth and
marked httpOnly, so JS cannot read it either; only a request the browser
itself sends to /auth/refresh carries it.

JWTs are stateless, so "rotating" a refresh token on its own does not revoke
the old one -- it is still valid until it expires, stolen or not. Each
refresh token carries the user's `token_version`; /auth/logout bumps it in
the database, which invalidates every refresh token issued before the bump
in one write. Access tokens skip this check and just expire naturally after
15 minutes -- fast enough that adding a database round-trip to every
authenticated request to catch the same case is not worth it.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..config import Settings, get_settings
from ..db import get_db
from ..deps import get_current_user
from ..schemas import AccessTokenOut, LoginRequest, RegisterRequest, UserOut
from ..security import TokenError, create_token, decode_token, hash_password, verify_password_or_dummy

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/auth"


def _set_refresh_cookie(response: Response, user_id: int, token_version: int, settings: Settings) -> None:
    token = create_token(user_id, "refresh", settings, token_version=token_version)
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def _access_token_out(user_id: int, settings: Settings) -> AccessTokenOut:
    return AccessTokenOut(
        access_token=create_token(user_id, "access", settings),
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: sqlite3.Connection = Depends(get_db)) -> UserOut:
    existing = db.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "an account with this email already exists")

    cur = db.execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)", (body.email, hash_password(body.password))
    )
    db.commit()
    return UserOut(id=cur.lastrowid, email=body.email)


@router.post("/login", response_model=AccessTokenOut)
def login(
    body: LoginRequest,
    response: Response,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccessTokenOut:
    user = db.execute("SELECT id, password_hash, token_version FROM users WHERE email = ?", (body.email,)).fetchone()
    password_hash = user["password_hash"] if user is not None else None
    if not verify_password_or_dummy(body.password, password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "incorrect email or password")

    _set_refresh_cookie(response, user["id"], user["token_version"], settings)
    return _access_token_out(user["id"], settings)


@router.post("/refresh", response_model=AccessTokenOut)
def refresh(
    request: Request,
    response: Response,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccessTokenOut:
    token = request.cookies.get(REFRESH_COOKIE)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh cookie; log in again")
    try:
        payload = decode_token(token, "refresh", settings)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    user = db.execute("SELECT id, token_version FROM users WHERE id = ?", (payload.user_id,)).fetchone()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")
    if user["token_version"] != payload.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session revoked; log in again")

    _set_refresh_cookie(response, user["id"], user["token_version"], settings)
    return _access_token_out(user["id"], settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    user: sqlite3.Row = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    # Bumping token_version invalidates every refresh token issued so far for
    # this user, on every device -- not just the one that called /logout.
    db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user["id"],))
    db.commit()
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.get("/me", response_model=UserOut)
def me(user: sqlite3.Row = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user["id"], email=user["email"])
