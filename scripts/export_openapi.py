"""Dumps the FastAPI app's OpenAPI schema to disk.

Imports the app object directly rather than hitting a running server, so
type generation never depends on a server being up.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.main import app  # noqa: E402

if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else "web/openapi.json"
    with open(out_path, "w") as f:
        json.dump(app.openapi(), f, indent=2)
    print(f"wrote {out_path}")
