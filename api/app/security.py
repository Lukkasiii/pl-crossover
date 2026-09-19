"""Password hashing and JWT issuance/verification.

Access tokens are handed back in the login/refresh response body and kept in
memory on the client. Refresh tokens live only in an httpOnly cookie -- see
`routers/auth.py`. Neither token type is ever written to a database; a stolen
JWT_SECRET or a short wait for the access token to expire are the only ways
either one stops working, which is the point of using JWT here at all.
"""

from __future__ import annotations

import time
from typing import Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import Settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


class TokenError(Exception):
    pass


def create_token(user_id: int, token_type: Literal["access", "refresh"], settings: Settings) -> str:
    ttl_minutes = settings.access_token_minutes if token_type == "access" else settings.refresh_token_days * 24 * 60
    now = int(time.time())
    payload = {"sub": str(user_id), "type": token_type, "iat": now, "exp": now + ttl_minutes * 60}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: Literal["access", "refresh"], settings: Settings) -> int:
    """Returns the user id, or raises TokenError with a message safe to expose."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise TokenError("token is invalid or expired") from exc

    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise TokenError("token is malformed") from exc
