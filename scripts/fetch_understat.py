#!/usr/bin/env python3
"""
Fetch match-level xG data for the English Premier League from Understat.

Understat used to render the fixture list into the league page as a hex-escaped
JSON blob assigned to `var datesData`. It no longer does: the page ships almost
empty and the browser calls an endpoint for the data.

    GET https://understat.com/getLeagueData/EPL/<year>
    X-Requested-With: XMLHttpRequest        <- without this header it 404s

The response is JSON with three keys:

    dates   380 fixtures: id, datetime, home/away team, goals, xG
    teams   per team, a 38-match history with xG, xGA, npxG, xpts, ppda, deep
    players season totals per player

`dates` has exactly the shape the old embedded blob had, so everything
downstream is unchanged. The whole payload is saved anyway -- the extra
per-team fields cost nothing to keep and are awkward to re-fetch later.

The old HTML scrape is kept as a fallback in case the endpoint moves again.
Standard library only, no pip install required.

Usage:
    python3 scripts/fetch_understat.py                 # seasons 2016..2024
    python3 scripts/fetch_understat.py 2020 2021       # a subset
    python3 scripts/fetch_understat.py --out data/raw  # custom output dir
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request

LEAGUE = "EPL"
API_URL = "https://understat.com/getLeagueData/{league}/{year}"
PAGE_URL = "https://understat.com/league/{league}/{year}"

# 2016 is needed as the "prior season" for the 2016/17 -> 2017/18 pair,
# 2024 is the last season in the study (2024/25).
DEFAULT_SEASONS = list(range(2016, 2025))

MATCHES_PER_SEASON = 380
TEAMS_PER_SEASON = 20
GAMES_PER_TEAM = 38

BLOB_RE = re.compile(r"datesData\s*=\s*JSON\.parse\('(?P<blob>.*?)'\)", re.DOTALL)

BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept-Encoding": "gzip",
    "Accept-Language": "en-US,en;q=0.9",
}

# The endpoint is guarded by this header alone. jQuery sets it on every $.ajax
# call, which is why the site works in a browser and a plain GET does not.
API_HEADERS = {
    **BASE_HEADERS,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

PAGE_HEADERS = {**BASE_HEADERS, "Accept": "text/html,application/xhtml+xml"}

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

CERT_HELP = """
TLS verification failed. On macOS this almost always means the python.org build
of Python has no certificate bundle yet. Run this once, let it finish, then try
again:

    /Applications/Python\\ 3.12/Install\\ Certificates.command

(adjust the version to match `ls -d /Applications/Python*/`)
"""


class FetchError(RuntimeError):
    pass


def http_get(url: str, headers: dict, retries: int = 3, backoff: float = 2.0) -> bytes:
    """GET a URL and return the decompressed body, retrying on transient failures."""
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    payload = gzip.GzipFile(fileobj=io.BytesIO(payload)).read()
                return payload
        except urllib.error.HTTPError as err:
            # A 404 here is a contract change, not a blip; do not sit through retries.
            raise FetchError(f"HTTP {err.code} {err.reason} for {url}") from err
        except ssl.SSLCertVerificationError as err:
            raise FetchError(f"{err}\n{CERT_HELP}") from err
        except (urllib.error.URLError, TimeoutError) as err:
            last_err = err
            if attempt < retries:
                wait = backoff**attempt
                print(f"    ! {err} -- retrying in {wait:.0f}s ({attempt}/{retries})", file=sys.stderr)
                time.sleep(wait)
    raise FetchError(f"could not fetch {url}: {last_err}")


def fetch_via_api(season: int) -> tuple[list[dict], dict]:
    """Preferred path: the JSON endpoint the site's own frontend calls."""
    url = API_URL.format(league=LEAGUE, year=season)
    body = http_get(url, API_HEADERS)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as err:
        raise FetchError(
            f"{url} did not return JSON ({len(body)} bytes). "
            f"The X-Requested-With guard may have changed."
        ) from err

    fixtures = payload.get("dates")
    if not isinstance(fixtures, list):
        raise FetchError(f"{url} returned JSON without a 'dates' list (keys: {list(payload)})")
    return fixtures, payload


def fetch_via_page(season: int) -> tuple[list[dict], dict]:
    """Fallback: the old embedded `datesData` blob, in case the endpoint moves."""
    url = PAGE_URL.format(league=LEAGUE, year=season)
    html = http_get(url, PAGE_HEADERS).decode("utf-8", errors="replace")
    match = BLOB_RE.search(html)
    if not match:
        raise FetchError(f"no datesData blob in {url} ({len(html)} bytes)")
    blob = match.group("blob").encode("utf-8").decode("unicode_escape")
    fixtures = json.loads(blob)
    return fixtures, {"dates": fixtures}


def normalise(fixtures: list[dict], season: int) -> list[dict]:
    """Keep played matches only and flatten to the columns we care about."""
    rows = []
    for m in fixtures:
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


def check_season(rows: list[dict]) -> list[str]:
    """A complete Premier League season is 20 teams x 38 games = 380 matches."""
    teams = {r["home_team"] for r in rows} | {r["away_team"] for r in rows}
    played: dict[str, int] = {t: 0 for t in teams}
    for r in rows:
        played[r["home_team"]] += 1
        played[r["away_team"]] += 1

    problems = []
    if len(rows) != MATCHES_PER_SEASON:
        problems.append(f"{len(rows)} matches (expected {MATCHES_PER_SEASON})")
    if len(teams) != TEAMS_PER_SEASON:
        problems.append(f"{len(teams)} teams (expected {TEAMS_PER_SEASON})")
    odd = {t: n for t, n in played.items() if n != GAMES_PER_TEAM}
    if odd:
        problems.append(f"teams not on {GAMES_PER_TEAM} games: {odd}")
    return problems


def write_outputs(rows: list[dict], payload: dict, season: int, out_dir: str) -> None:
    stem = os.path.join(out_dir, f"understat_{LEAGUE}_{season}")

    with open(f"{stem}.json", "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    with open(f"{stem}.csv", "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def fetch_season(season: int, out_dir: str) -> bool:
    print(f"[{season}/{season + 1}]", flush=True)

    fixtures = payload = None
    for label, fetcher in (("api", fetch_via_api), ("page fallback", fetch_via_page)):
        try:
            fixtures, payload = fetcher(season)
            print(f"    via {label}: {len(fixtures)} fixtures", flush=True)
            break
        except FetchError as err:
            print(f"    {label} failed: {err}", file=sys.stderr, flush=True)

    if fixtures is None:
        return False

    rows = normalise(fixtures, season)
    problems = check_season(rows)
    if problems:
        print(f"    ! incomplete: {'; '.join(problems)}", file=sys.stderr, flush=True)
    else:
        print(f"    ok: {MATCHES_PER_SEASON} matches, {TEAMS_PER_SEASON} teams, all on {GAMES_PER_TEAM} games", flush=True)

    write_outputs(rows, payload, season, out_dir)
    print(f"    wrote understat_{LEAGUE}_{season}.json / .csv", flush=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("seasons", nargs="*", type=int, help="season start years, e.g. 2017 2018")
    parser.add_argument("--out", default="data/raw", help="output directory (default: data/raw)")
    parser.add_argument("--sleep", type=float, default=1.5, help="seconds to wait between seasons")
    args = parser.parse_args()

    seasons = args.seasons or DEFAULT_SEASONS
    os.makedirs(args.out, exist_ok=True)

    failures = []
    for i, season in enumerate(seasons):
        if not fetch_season(season, args.out):
            failures.append(season)
        if i < len(seasons) - 1:
            time.sleep(args.sleep)

    if failures:
        print(f"\n{len(failures)} season(s) failed: {failures}", file=sys.stderr)
        return 1

    print(f"\nDone. {len(seasons)} season(s) written to {args.out}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
