"""Password hashing and JWT issuance/verification.

Access tokens are handed back in the login/refresh response body and kept in
memory on the client. Refresh tokens live only in an httpOnly cookie -- see
`routers/auth.py`. A stolen access token is a 15-minute problem by itself
(natural expiry, no state to check); a refresh token is a 30-day problem
unless something can revoke it, which is what `token_version` is for -- see
`decode_token`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import Settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# A verify_password() call against a real hash costs ~100ms (bcrypt's whole
# point). If login only pays that cost for existing emails, the response
# time itself tells an attacker which emails are registered. Hashing this
# constant once at import time gives login something to check against a
# nonexistent user, at the same cost, every time.
_DUMMY_HASH = pwd_context.hash("not a real password, only used to equalize login timing")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def verify_password_or_dummy(password: str, password_hash: str | None) -> bool:
    """Like verify_password, but takes the same time whether or not the user exists.

    Pass None when no user was found for the login email; this still runs a
    bcrypt verify (against a fixed dummy hash) and always returns False.
    """
    if password_hash is None:
        pwd_context.verify(password, _DUMMY_HASH)
        return False
    return pwd_context.verify(password, password_hash)


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class TokenPayload:
    user_id: int
    token_version: int | None = None  # only set on refresh tokens


def create_token(
    user_id: int, token_type: Literal["access", "refresh"], settings: Settings, token_version: int = 0
) -> str:
    ttl_minutes = settings.access_token_minutes if token_type == "access" else settings.refresh_token_days * 24 * 60
    now = int(time.time())
    payload = {"sub": str(user_id), "type": token_type, "iat": now, "exp": now + ttl_minutes * 60}
    if token_type == "refresh":
        payload["tv"] = token_version
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: Literal["access", "refresh"], settings: Settings) -> TokenPayload:
    """Raises TokenError, with a message safe to expose, on anything wrong with the token itself.

    Does not check `token_version` against the database -- that comparison
    needs a live user row and belongs in the caller (see routers/auth.py's
    /refresh), not here.
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise TokenError("token is invalid or expired") from exc

    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise TokenError("token is malformed") from exc

    token_version = payload.get("tv") if expected_type == "refresh" else None
    return TokenPayload(user_id=user_id, token_version=token_version)
