#!/usr/bin/env python3
"""
Seed a demo account so the README's login instructions always work against a
fresh `data/pl.db` -- and against anyone else's copy of it.

    python3 scripts/seed_demo_account.py

Idempotent: re-running it against a db that already has the account resets
its password instead of erroring, since a demo credential that silently stops
matching the README is worse than a rewritten hash.
"""

from __future__ import annotations

import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402

DEMO_EMAIL = "demo@plcrossover.dev"
DEMO_PASSWORD = "crossover-demo"


def main() -> None:
    con = sqlite3.connect(settings.db_path)
    try:
        password_hash = hash_password(DEMO_PASSWORD)
        existing = con.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,)).fetchone()
        if existing is None:
            con.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (DEMO_EMAIL, password_hash))
            print(f"created demo account {DEMO_EMAIL}")
        else:
            con.execute("UPDATE users SET password_hash = ? WHERE email = ?", (password_hash, DEMO_EMAIL))
            print(f"reset password for existing demo account {DEMO_EMAIL}")
        con.commit()
    finally:
        con.close()


if __name__ == "__main__":
    main()
