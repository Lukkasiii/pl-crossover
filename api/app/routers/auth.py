"""Access token in the response body, refresh token in an httpOnly cookie.

The access token never touches storage the client controls beyond memory, so
an XSS payload that can run JS still cannot read it out of localStorage --
there is nothing there to read. The refresh cookie is scoped to /auth and
marked httpOnly, so JS cannot read it either; only a request the browser
itself sends to /auth/refresh carries it.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..config import Settings, get_settings
from ..db import get_db
from ..deps import get_current_user
from ..schemas import AccessTokenOut, LoginRequest, RegisterRequest, UserOut
from ..security import TokenError, create_token, decode_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, user_id: int, settings: Settings) -> None:
    token = create_token(user_id, "refresh", settings)
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/auth",
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
    user = db.execute("SELECT id, password_hash FROM users WHERE email = ?", (body.email,)).fetchone()
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "incorrect email or password")

    _set_refresh_cookie(response, user["id"], settings)
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
        user_id = decode_token(token, "refresh", settings)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    user = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")

    _set_refresh_cookie(response, user["id"], settings)  # rotate on use
    return _access_token_out(user["id"], settings)


@router.get("/me", response_model=UserOut)
def me(user: sqlite3.Row = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user["id"], email=user["email"])
