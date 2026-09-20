"""Per-request SQLite connections.

Opening a fresh connection per request (instead of one long-lived connection)
sidesteps sqlite3's same-thread restriction and keeps `get_db` overridable
through `app.dependency_overrides` in tests -- point `get_settings` at a
tmp-path db and every route, including the analytics caches, follows it.

`check_same_thread=False`: a sync route + a sync `yield` dependency are each
individually offloaded to FastAPI's worker threadpool, and nothing guarantees
the *same* pool thread handles both for one request -- under enough
concurrent load (surfaced by e2e/accessibility.spec.ts's two tests hitting a
shared backend), `connect()` and the route's `con.execute()` landed on
different threads and sqlite3 raised "objects created in a thread can only be
used in that same thread". Safe here because a connection is still only ever
touched sequentially by one request at a time, never concurrently by two --
`check_same_thread` is guarding against exactly that concurrent case, not
against which thread happens to run the sequence.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends

from .config import Settings, get_settings


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def get_db(settings: Settings = Depends(get_settings)) -> Iterator[sqlite3.Connection]:
    con = connect(settings.db_path)
    try:
        yield con
    finally:
        con.close()
