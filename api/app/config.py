"""Process-wide settings, read from the environment once at import time."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


@dataclass(frozen=True)
class Settings:
    db_path: str = field(default_factory=lambda: os.environ.get("PL_DB_PATH", os.path.join(ROOT, "data", "pl.db")))
    jwt_secret: str = field(default_factory=lambda: os.environ.get("PL_JWT_SECRET") or _generate_dev_secret())
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cookie_secure: bool = field(default_factory=lambda: os.environ.get("PL_COOKIE_SECURE", "0") == "1")
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in os.environ.get("PL_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        )
    )


def _generate_dev_secret() -> str:
    # No PL_JWT_SECRET set: fine for a demo, but tokens will not survive a
    # restart. Set the env var for anything that needs to persist sessions.
    import sys

    secret = secrets.token_hex(32)
    print(
        "PL_JWT_SECRET not set -- using a random per-process secret "
        "(existing tokens will stop working on restart). "
        "Set PL_JWT_SECRET to persist sessions across restarts.",
        file=sys.stderr,
    )
    return secret


settings = Settings()


def get_settings() -> Settings:
    return settings
