"""TestClient fixture for the API tests.

Builds a 3-season (2 pair) synthetic database via `factory.build_synthetic_db`
-- more than one pair is needed for LOSO and the per-season method to have
more than a single group to work with -- and wires it into the app through
`app.dependency_overrides`, the same seam a production deployment would use
to point at a different `data/pl.db`.
"""

from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "api"))
sys.path.insert(0, os.path.dirname(__file__))

from factory import build_synthetic_db  # noqa: E402

from app.config import Settings, get_settings  # noqa: E402
from app.db import connect, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app import analytics, replay  # noqa: E402


@pytest.fixture(scope="session")
def db_path(tmp_path_factory):
    return build_synthetic_db(tmp_path_factory, seasons=(2016, 2017, 2018))


@pytest.fixture()
def client(db_path):
    test_settings = Settings(
        db_path=db_path,
        jwt_secret="test-secret",
        cookie_secure=False,
    )

    def _get_settings_override():
        return test_settings

    def _get_db_override():
        con = connect(test_settings.db_path)
        try:
            yield con
        finally:
            con.close()

    app.dependency_overrides[get_settings] = _get_settings_override
    app.dependency_overrides[get_db] = _get_db_override

    # Analytics/replay caches are keyed by db_path, but wipe them between
    # tests anyway so a mutated scenario/user row is never served stale.
    analytics._obs_cache.clear()
    analytics._curve_cache.clear()
    replay._frame_cache.clear()

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def second_client(client):
    """An independent cookie jar against the same overridden app -- a second browser."""
    with TestClient(app) as c:
        yield c
