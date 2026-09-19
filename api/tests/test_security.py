"""Unit tests for the password-hashing helpers, independent of the API."""

from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "api"))

from app.security import hash_password, verify_password_or_dummy  # noqa: E402


def test_verify_password_or_dummy_checks_a_real_hash():
    h = hash_password("correct horse battery staple")
    assert verify_password_or_dummy("correct horse battery staple", h) is True
    assert verify_password_or_dummy("wrong guess", h) is False


def test_verify_password_or_dummy_is_false_for_a_missing_user():
    assert verify_password_or_dummy("anything", None) is False


def test_missing_user_path_does_real_bcrypt_work():
    """A no-op would make the user-enumeration timing leak this exists to close."""
    start = time.perf_counter()
    verify_password_or_dummy("anything", None)
    elapsed = time.perf_counter() - start
    assert elapsed > 0.01  # bcrypt at any reasonable cost factor clears this easily
