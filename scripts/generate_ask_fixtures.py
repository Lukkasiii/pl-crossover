"""Generates `api/app/ask_fixtures.json`, the committed cache `/api/ask`
serves from (see CLAUDE.md "Feature 3" and api/app/ask.py's module docstring).

Runs each preset question's tool-call plan against the real `data/pl.db` and
renders its answer from the results -- the exact same `run_tool_loop` /
`build_answer` functions api/tests/test_ask_fixtures.py uses to prove the
committed numbers still match a fresh run. Run this again, and commit the
diff, whenever `data/pl.db` is rebuilt or a preset question changes:

    python3 scripts/generate_ask_fixtures.py
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.ask import PRESET_QUESTIONS, build_answer  # noqa: E402
from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "api", "app", "ask_fixtures.json")


def main() -> None:
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        fixtures = [build_answer(con, settings.db_path, preset) for preset in PRESET_QUESTIONS]
    finally:
        con.close()

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fixtures, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"wrote {OUT_PATH} ({len(fixtures)} preset answers)")


if __name__ == "__main__":
    main()
