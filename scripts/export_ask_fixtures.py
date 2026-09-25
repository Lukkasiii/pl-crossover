"""Copies the committed `api/app/ask_fixtures.json` to
`web/public/demo/ask-fixtures.json` for the static demo build.

Unlike export_predict_grid.py/export_pair_curves.py, this has no database
work to do: `/api/ask` is already a pure fixture lookup in every deployment
(see api/app/ask.py's CachedAskSource), so the demo build just needs its own
copy of the same file -- regenerate the source with
`scripts/generate_ask_fixtures.py`, not this script.
"""

from __future__ import annotations

import os
import shutil

SRC = os.path.join(os.path.dirname(__file__), "..", "api", "app", "ask_fixtures.json")
DEST = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo", "ask-fixtures.json")


def main() -> None:
    shutil.copyfile(SRC, DEST)
    print(f"wrote {DEST} ({os.path.getsize(DEST)} bytes)")


if __name__ == "__main__":
    main()
