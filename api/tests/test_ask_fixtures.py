"""Every number in a cached `/api/ask` answer must be reproducible by running
its own tool calls against the real API (CLAUDE.md "Feature 3"). This test
re-executes each committed fixture's recorded plan against the real
`data/pl.db` (not the synthetic 3-season db the rest of the suite uses --
these fixtures were generated from, and must stay honest about, the real
data) and asserts the freshly computed tool results and re-rendered answer
text match what is committed byte-for-byte.

A fixture that drifts from the model (a later change to model.py, a
data/pl.db rebuild) is worse than no fixture -- it is a confidently wrong
number on a portfolio site. If this test fails, the fix is
`python3 scripts/generate_ask_fixtures.py` and committing the diff, not
loosening the assertion.
"""

from __future__ import annotations

import json
import os

import pytest

from app.ask import FIXTURES_PATH, PRESET_BY_ID, PRESET_QUESTIONS, build_answer
from app.config import get_settings
from app.db import connect

pytestmark = pytest.mark.skipif(
    not os.path.exists(get_settings().db_path),
    reason="needs the real data/pl.db (see README setup) -- not built in a bare checkout",
)


@pytest.fixture(scope="module")
def real_con():
    settings = get_settings()
    con = connect(settings.db_path)
    try:
        yield con, settings.db_path
    finally:
        con.close()


@pytest.fixture(scope="module")
def committed_fixtures():
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return {f["id"]: f for f in json.load(f)}


def test_fixtures_file_covers_every_preset_question(committed_fixtures):
    assert set(committed_fixtures) == set(PRESET_BY_ID)


@pytest.mark.parametrize("preset", PRESET_QUESTIONS, ids=[p.id for p in PRESET_QUESTIONS])
def test_fixture_reproduces_from_a_fresh_run(preset, real_con, committed_fixtures):
    con, db_path = real_con
    fresh = build_answer(con, db_path, preset)
    committed = committed_fixtures[preset.id]

    assert fresh["answer_en"] == committed["answer_en"]
    assert fresh["answer_zh"] == committed["answer_zh"]
    assert fresh["tool_calls"] == committed["tool_calls"]
