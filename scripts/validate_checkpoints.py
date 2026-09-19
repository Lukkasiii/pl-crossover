#!/usr/bin/env python3
"""
Regression test against the original coursework.

Runs the engine in api/app/model.py over the checkpoint spreadsheet and checks
that it reproduces the pooled RMSE / R-squared table from the final
presentation. If this stops passing, the model changed in a way that breaks
continuity with the analysis the project is built on.

Also prints the leave-one-season-out numbers, which the presentation did not
report, so the gap between in-sample and held-out performance is on the record.

    python3 scripts/validate_checkpoints.py
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from app.model import ols_fit, ols_fit_loso  # noqa: E402

WORKBOOK = os.path.join(os.path.dirname(__file__), "..", "data", "excel", "xGxGD8Seasons.xlsx")
TOLERANCE = 0.005  # the deck rounds to 2 decimals / 3 decimals

# (sheet, predictor column, published RMSE, published R^2)
EXPECTED = [
    ("xGData", "Prior xG (full)", 4.09, 0.443),
    ("xGData", "xG @5", 4.50, 0.323),
    ("xGData", "xG @10", 4.17, 0.419),
    ("xGData", "xG @15", 3.87, 0.501),
    ("xGData", "xG @20", 3.63, 0.559),
    ("xGDData", "Prior xGD (full)", 3.76, 0.528),
    ("xGDData", "xGD @5", 4.49, 0.329),
    ("xGDData", "xGD @10", 3.96, 0.477),
    ("xGDData", "xGD @15", 3.58, 0.571),
    ("xGDData", "xGD @20", 3.30, 0.636),
]


def main() -> int:
    sheets = {name: pd.read_excel(WORKBOOK, sheet_name=name) for name in ("xGData", "xGDData")}

    print(f"{'predictor':<20} {'RMSE':>7} {'deck':>7} {'R2':>7} {'deck':>7}  {'LOSO RMSE':>10}   status")
    print("-" * 78)

    failures = 0
    for sheet, column, want_rmse, want_r2 in EXPECTED:
        df = sheets[sheet]
        x = df[column].to_numpy()
        y = df["Final Rank"].to_numpy()
        groups = df["Season Pair"].to_numpy()

        fit = ols_fit(x, y)
        loso = ols_fit_loso(x, y, groups)

        ok = abs(fit.rmse - want_rmse) < TOLERANCE and abs(fit.r2 - want_r2) < TOLERANCE
        failures += not ok

        print(
            f"{column:<20} {fit.rmse:>7.3f} {want_rmse:>7.2f} {fit.r2:>7.3f} {want_r2:>7.3f}"
            f"  {loso.rmse:>10.3f}   {'ok' if ok else 'MISMATCH'}"
        )

    print("-" * 78)
    print(f"n = {len(sheets['xGData'])} team-seasons, {sheets['xGData']['Season Pair'].nunique()} season pairs")

    if failures:
        print(f"\n{failures} predictor(s) did not match the published results.", file=sys.stderr)
        return 1
    print("\nAll 10 published figures reproduced.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
