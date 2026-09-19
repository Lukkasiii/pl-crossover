#!/usr/bin/env python3
"""
One-shot diagnostic for scripts/fetch_understat.py.

Fetches a single Understat season page, reports exactly what came back, tries
several ways of locating the embedded fixture JSON, and saves the raw response
so the failure can be inspected offline.

    python3 scripts/diagnose_fetch.py
"""

from __future__ import annotations

import gzip
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

URL = "https://understat.com/league/EPL/2021"
OUT_DIR = "data/raw"
PAGE_PATH = os.path.join(OUT_DIR, "_debug_page.html")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Encoding": "gzip",
    "Accept-Language": "en-US,en;q=0.9",
}

# Candidate patterns, loosest last.
PATTERNS = {
    "A strict (current script)": r"var\s+datesData\s*=\s*JSON\.parse\('(.*?)'\)\s*;",
    "B no trailing semicolon": r"var\s+datesData\s*=\s*JSON\.parse\('(.*?)'\)",
    "C any JSON.parse after datesData": r"datesData[^']*'(.*?)'",
    "D double-quoted blob": r'datesData[^"]*"(.*?)"',
}


def line(char="-", n=72):
    print(char * n)


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"python : {sys.version.split()[0]}  ({sys.platform})")
    print(f"openssl: {ssl.OPENSSL_VERSION}")
    print(f"url    : {URL}")
    for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY"):
        if os.environ.get(var):
            print(f"proxy  : {var}={os.environ[var]}")
    line()

    try:
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            final_url = resp.geturl()
            raw = resp.read()
            encoding = resp.headers.get("Content-Encoding")
            ctype = resp.headers.get("Content-Type")
            server = resp.headers.get("Server")
    except urllib.error.HTTPError as err:
        print(f"HTTP ERROR {err.code} {err.reason}")
        print(f"headers: {dict(err.headers)}")
        body = err.read()[:800]
        print(f"body[:800]:\n{body.decode('utf-8', 'replace')}")
        return 1
    except urllib.error.URLError as err:
        print(f"NETWORK ERROR: {err.reason}")
        print("\nThis is a connection-level failure, not a parsing problem.")
        print("Likely causes: no internet, DNS blocked, VPN/corporate proxy, or")
        print("a TLS interception certificate the system store does not trust.")
        return 1
    except Exception as err:  # noqa: BLE001
        print(f"UNEXPECTED {type(err).__name__}: {err}")
        return 1

    if encoding == "gzip":
        raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
    html = raw.decode("utf-8", errors="replace")

    print(f"status      : {status}")
    print(f"final url   : {final_url}")
    print(f"server      : {server}")
    print(f"content-type: {ctype}")
    print(f"bytes       : {len(raw)}")
    line()

    with open(PAGE_PATH, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"saved response to {PAGE_PATH}")
    line()

    print("markers present in the page:")
    for marker in ("datesData", "teamsData", "playersData", "JSON.parse",
                   "Just a moment", "cf-browser-verification", "captcha",
                   "Access denied", "<title>"):
        print(f"  {marker:<26} {'yes' if marker in html else 'no'}")
    line()

    if "<title>" in html:
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        if title:
            print(f"page title  : {title.group(1).strip()[:120]}")
            line()

    if "datesData" not in html:
        print("The page does not contain 'datesData' at all.")
        print("First 600 characters of what came back:\n")
        print(html[:600])
        return 1

    idx = html.find("datesData")
    print("context around 'datesData' (120 chars before, 200 after):\n")
    print(repr(html[max(0, idx - 120): idx + 200]))
    line()

    print("pattern results:")
    winner = None
    for name, pattern in PATTERNS.items():
        m = re.search(pattern, html, re.DOTALL)
        if not m:
            print(f"  {name:<32} no match")
            continue
        blob = m.group(1)
        try:
            decoded = blob.encode("utf-8").decode("unicode_escape")
            data = json.loads(decoded)
            n = len(data)
            played = sum(1 for d in data if d.get("isResult"))
            print(f"  {name:<32} MATCH  blob={len(blob)} chars  {n} fixtures, {played} played")
            if winner is None:
                winner = (name, data)
        except Exception as err:  # noqa: BLE001
            print(f"  {name:<32} match but undecodable: {type(err).__name__}: {err}")
    line()

    if winner:
        name, data = winner
        print(f"WORKING PATTERN: {name}")
        sample = next((d for d in data if d.get("isResult")), data[0])
        print("sample fixture object:")
        print(json.dumps(sample, indent=2)[:700])
        return 0

    print("Page fetched fine, but no pattern could extract the fixture JSON.")
    print(f"Inspect {PAGE_PATH} to see what changed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
