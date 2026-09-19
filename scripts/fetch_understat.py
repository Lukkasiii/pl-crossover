#!/usr/bin/env python3
"""
Fetch match-level xG data for the English Premier League from Understat.

Understat renders its league pages server-side and embeds the fixture list as a
hex-escaped JSON blob inside a <script> tag:

    var datesData = JSON.parse('\\x5B\\x7B\\x22id\\x22\\x3A\\x2211643\\x22 ...');

There is no public API, so we pull the page, extract that blob, unescape it and
parse it as JSON. Standard library only -- no pip install required.

Usage:
    python3 scripts/fetch_understat.py                 # seasons 2016..2024
    python3 scripts/fetch_understat.py 2020 2021       # a subset
    python3 scripts/fetch_understat.py --out data/raw  # custom output dir

Output (per season):
    data/raw/understat_EPL_<year>.json   raw match objects, exactly as served
    data/raw/understat_EPL_<year>.csv    flat table, one row per match

A season is named by the calendar year it starts in: 2017 == the 2017/18 season.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

LEAGUE = "EPL"
BASE_URL = "https://understat.com/league/{league}/{year}"

# 2016 is needed as the "prior season" for the 2016/17 -> 2017/18 pair,
# 2024 is the last season in the study (2024/25).
DEFAULT_SEASONS = list(range(2016, 2025))

BLOB_RE = re.compile(r"var\s+datesData\s*=\s*JSON\.parse\('(?P<blob>.*?)'\)\s*;", re.DOTALL)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Encoding": "gzip",
    "Accept-Language": "en-US,en;q=0.9",
}

CSV_COLUMNS = [
    "match_id",
    "season",
    "datetime",
    "home_team",
    "away_team",
    "home_goals",
    "away_goals",
    "home_xg",
    "away_xg",
]


class FetchError(RuntimeError):
    pass


def http_get(url: str, retries: int = 3, backoff: float = 2.0) -> str:
    """GET a URL and return decoded text, retrying on transient failures."""
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    payload = gzip.GzipFile(fileobj=io.BytesIO(payload)).read()
                return payload.decode("utf-8", errors="replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as err:
            last_err = err
            if attempt < retries:
                wait = backoff ** attempt
                print(f"    ! {err} -- retrying in {wait:.0f}s ({attempt}/{retries})", file=sys.stderr)
                time.sleep(wait)
    raise FetchError(f"could not fetch {url}: {last_err}")


def extract_dates_data(html: str, url: str) -> list[dict]:
    """Pull the datesData JSON blob out of the page source."""
    match = BLOB_RE.search(html)
    if not match:
        raise FetchError(
            f"no datesData blob found at {url}. Understat may have changed its page "
            f"structure, or the response was a block page ({len(html)} bytes received)."
        )
    # The blob is ASCII with \xNN escapes; unicode_escape turns those back into text.
    blob = match.group("blob").encode("utf-8").decode("unicode_escape")
    return json.loads(blob)


def normalise(raw: list[dict], season: int) -> list[dict]:
    """Keep played matches only and flatten to the columns we care about."""
    rows = []
    for m in raw:
        # Fixtures that have not been played yet carry isResult=False and null goals.
        if not m.get("isResult"):
            continue
        rows.append(
            {
                "match_id": int(m["id"]),
                "season": season,
                "datetime": m["datetime"],
                "home_team": m["h"]["title"],
                "away_team": m["a"]["title"],
                "home_goals": int(m["goals"]["h"]),
                "away_goals": int(m["goals"]["a"]),
                "home_xg": round(float(m["xG"]["h"]), 5),
                "away_xg": round(float(m["xG"]["a"]), 5),
            }
        )
    rows.sort(key=lambda r: (r["datetime"], r["match_id"]))
    return rows


def check_season(rows: list[dict], season: int) -> None:
    """A complete Premier League season is 20 teams x 38 games = 380 matches."""
    teams = {r["home_team"] for r in rows} | {r["away_team"] for r in rows}
    played = {t: 0 for t in teams}
    for r in rows:
        played[r["home_team"]] += 1
        played[r["away_team"]] += 1

    problems = []
    if len(rows) != 380:
        problems.append(f"{len(rows)} matches (expected 380)")
    if len(teams) != 20:
        problems.append(f"{len(teams)} teams (expected 20)")
    odd = {t: n for t, n in played.items() if n != 38}
    if odd:
        problems.append(f"teams not on 38 games: {odd}")

    if problems:
        print(f"    ! season {season} looks incomplete: {'; '.join(problems)}", file=sys.stderr)
    else:
        print(f"    ok: 380 matches, 20 teams, all on 38 games")


def write_outputs(rows: list[dict], raw: list[dict], season: int, out_dir: str) -> None:
    stem = os.path.join(out_dir, f"understat_{LEAGUE}_{season}")

    with open(f"{stem}.json", "w", encoding="utf-8") as fh:
        json.dump(raw, fh, ensure_ascii=False, indent=1)

    with open(f"{stem}.csv", "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"    wrote {stem}.json and {stem}.csv")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("seasons", nargs="*", type=int, help="season start years, e.g. 2017 2018")
    parser.add_argument("--out", default="data/raw", help="output directory (default: data/raw)")
    parser.add_argument("--sleep", type=float, default=1.5, help="seconds to wait between seasons")
    args = parser.parse_args()

    seasons = args.seasons or DEFAULT_SEASONS
    os.makedirs(args.out, exist_ok=True)

    failures = []
    for season in seasons:
        url = BASE_URL.format(league=LEAGUE, year=season)
        print(f"[{season}/{season + 1}] {url}")
        try:
            html = http_get(url)
            raw = extract_dates_data(html, url)
            rows = normalise(raw, season)
            check_season(rows, season)
            write_outputs(rows, raw, season, args.out)
        except (FetchError, json.JSONDecodeError, KeyError) as err:
            print(f"    FAILED: {err}", file=sys.stderr)
            failures.append(season)
        if season != seasons[-1]:
            time.sleep(args.sleep)

    if failures:
        print(f"\n{len(failures)} season(s) failed: {failures}", file=sys.stderr)
        return 1

    print(f"\nDone. {len(seasons)} season(s) written to {args.out}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
