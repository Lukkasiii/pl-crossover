#!/usr/bin/env python3
"""
Work out why HTTPS verification is failing.

Dumps the certificate chain the server actually presents, compares it against
what Python trusts, and tries the same request through several trust stores and
tools. The issuer name on the presented certificate is usually the whole answer:
if it is a corporate or VPN CA rather than a public one, something on the network
is intercepting TLS.

    python3 scripts/diagnose_tls.py
"""

from __future__ import annotations

import os
import shutil
import socket
import ssl
import subprocess
import sys
import urllib.request

HOSTS = ["understat.com", "pypi.org", "github.com", "www.apple.com"]


def rule(title=""):
    print("\n" + "=" * 74)
    if title:
        print(title)
        print("=" * 74)


def name_to_str(name_tuples) -> str:
    """Flatten the nested tuple structure getpeercert() returns."""
    parts = []
    for rdn in name_tuples or ():
        for key, value in rdn:
            parts.append(f"{key}={value}")
    return ", ".join(parts)


def show_chain(host: str, port: int = 443) -> None:
    """Connect WITHOUT verification purely to read back what the server sent."""
    ctx = ssl._create_unverified_context()  # noqa: SLF001 - inspection only
    try:
        with socket.create_connection((host, port), timeout=15) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
                print(f"  tls version : {tls.version()}")
                print(f"  subject     : {name_to_str(cert.get('subject'))}")
                print(f"  ISSUER      : {name_to_str(cert.get('issuer'))}")
                print(f"  valid until : {cert.get('notAfter')}")
    except Exception as err:  # noqa: BLE001
        print(f"  could not even open a socket: {type(err).__name__}: {err}")


def try_verified(host: str, context: ssl.SSLContext | None, label: str) -> None:
    url = f"https://{host}/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "diag/1.0"})
        with urllib.request.urlopen(req, timeout=15, context=context) as resp:
            print(f"  {label:<22} OK ({resp.status}, {len(resp.read(2048))}+ bytes)")
    except Exception as err:  # noqa: BLE001
        msg = str(err)
        print(f"  {label:<22} FAIL {type(err).__name__}: {msg[:110]}")


def main() -> int:
    print(f"python  : {sys.version.split()[0]} ({sys.executable})")
    print(f"openssl : {ssl.OPENSSL_VERSION}")

    paths = ssl.get_default_verify_paths()
    print(f"cafile  : {paths.cafile}")
    if paths.cafile and os.path.exists(paths.cafile):
        size = os.path.getsize(paths.cafile)
        with open(paths.cafile, "rb") as fh:
            n = fh.read().count(b"BEGIN CERTIFICATE")
        real = os.path.realpath(paths.cafile)
        print(f"          exists, {size:,} bytes, {n} certificates")
        if real != paths.cafile:
            print(f"          -> symlink to {real}")
    else:
        print("          MISSING")

    try:
        import certifi

        print(f"certifi : {certifi.__version__} at {certifi.where()}")
    except ImportError:
        print("certifi : not installed")

    for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
        if os.environ.get(var):
            print(f"env     : {var}={os.environ[var]}")

    rule("certificate each host actually presents")
    for host in HOSTS:
        print(f"\n{host}")
        show_chain(host)

    rule("verified requests, per trust store")
    for host in HOSTS:
        print(f"\n{host}")
        try_verified(host, None, "python default")
        try:
            import certifi

            try_verified(host, ssl.create_default_context(cafile=certifi.where()), "certifi bundle")
        except ImportError:
            pass
        try:
            ctx = ssl.create_default_context()
            ctx.load_default_certs(ssl.Purpose.SERVER_AUTH)
            try_verified(host, ctx, "default + load_certs")
        except Exception as err:  # noqa: BLE001
            print(f"  {'default + load_certs':<22} setup failed: {err}")

    rule("curl (uses the macOS keychain, not Python's store)")
    if shutil.which("curl"):
        for host in HOSTS:
            proc = subprocess.run(
                ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "15", f"https://{host}/"],
                capture_output=True,
                text=True,
            )
            out = (proc.stdout or "").strip()
            err = (proc.stderr or "").strip()
            print(f"  {host:<18} {out or 'no response'}   {err[:90]}")
    else:
        print("  curl not found")

    rule("reading")
    print(
        "If the ISSUER above is a public authority (Let's Encrypt, DigiCert, Google\n"
        "Trust Services, Sectigo...) then the server is fine and the problem is\n"
        "Python's trust store.\n\n"
        "If the ISSUER is a company, school, VPN or security product name, TLS is\n"
        "being intercepted on this network. Python has to be told to trust that\n"
        "CA, or the connection has to be made from a network that does not do it\n"
        "(a phone hotspot is the fastest way to confirm)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
