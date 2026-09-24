"""Bakes each season pair's own RMSE curve (analytics.compute_curve scoped to
that one pair -- see its docstring) to static JSON for /compare's "two
season pairs" mode, the same way export_predict_grid.py bakes the pooled
grid for the prior-weight slider.

Unlike the pooled/per-season curves (one shared line for every pair), this
genuinely differs pair to pair -- each is that pair's own ~17 observations,
so it can't be derived from predict-grid.json and needs its own export.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.app.analytics import get_curve  # noqa: E402
from api.app.config import get_settings  # noqa: E402
from api.app.db import connect  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "demo", "pair-curves.json")
METRICS = ["xg", "xgd", "gd", "points"]


def main() -> None:
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        pair_ids = [r["id"] for r in con.execute("SELECT id FROM season_pairs ORDER BY id")]
        out: dict[str, dict] = {}
        for pair_id in pair_ids:
            out[str(pair_id)] = {}
            for metric in METRICS:
                c = get_curve(con, settings.db_path, metric, "pooled", pair_id)
                out[str(pair_id)][metric] = {
                    "priorRmse": round(c["prior"].rmse, 4),
                    "currentRmse": [round(f.rmse, 4) for f in c["current"]],
                    "crossover": c["crossover"],
                    "n": c["n_observations"],
                }
    finally:
        con.close()

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size = os.path.getsize(OUT_PATH)
    print(f"wrote {OUT_PATH} ({len(pair_ids)} pairs x {len(METRICS)} metrics, {size} bytes)")


if __name__ == "__main__":
    main()
