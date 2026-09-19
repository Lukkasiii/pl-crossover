"""Per-request SQLite connections.

Opening a fresh connection per request (instead of one long-lived connection)
sidesteps sqlite3's same-thread restriction and keeps `get_db` overridable
through `app.dependency_overrides` in tests -- point `get_settings` at a
tmp-path db and every route, including the analytics caches, follows it.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends

from .config import Settings, get_settings


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def get_db(settings: Settings = Depends(get_settings)) -> Iterator[sqlite3.Connection]:
    con = connect(settings.db_path)
    try:
        yield con
    finally:
        con.close()
