from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_db
from ..deps import get_current_user
from ..schemas import ScenarioCreate, ScenarioOut, ScenarioParams, ScenarioUpdate

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


def _row_to_out(r: sqlite3.Row) -> ScenarioOut:
    return ScenarioOut(
        id=r["id"],
        name=r["name"],
        params=ScenarioParams(**json.loads(r["params"])),
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )


def _get_owned(db: sqlite3.Connection, user_id: int, scenario_id: int) -> sqlite3.Row:
    row = db.execute(
        "SELECT * FROM saved_scenarios WHERE id = ? AND user_id = ?", (scenario_id, user_id)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no scenario with id {scenario_id}")
    return row


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(
    user: sqlite3.Row = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)
) -> list[ScenarioOut]:
    rows = db.execute(
        "SELECT * FROM saved_scenarios WHERE user_id = ? ORDER BY updated_at DESC", (user["id"],)
    ).fetchall()
    return [_row_to_out(r) for r in rows]


@router.post("", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(
    body: ScenarioCreate,
    user: sqlite3.Row = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> ScenarioOut:
    existing = db.execute(
        "SELECT id FROM saved_scenarios WHERE user_id = ? AND name = ?", (user["id"], body.name)
    ).fetchone()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"you already have a scenario named '{body.name}'")

    cur = db.execute(
        "INSERT INTO saved_scenarios (user_id, name, params) VALUES (?, ?, ?)",
        (user["id"], body.name, body.params.model_dump_json()),
    )
    db.commit()
    return _row_to_out(_get_owned(db, user["id"], cur.lastrowid))


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    body: ScenarioUpdate,
    user: sqlite3.Row = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> ScenarioOut:
    row = _get_owned(db, user["id"], scenario_id)
    name = body.name if body.name is not None else row["name"]
    # Names are unique per user (UNIQUE (user_id, name) in build_db.py) --
    # checked here so a rename onto a taken name is the same clean 409 a
    # create gets, not the IntegrityError (500) the constraint would raise.
    clash = db.execute(
        "SELECT id FROM saved_scenarios WHERE user_id = ? AND name = ? AND id != ?", (user["id"], name, scenario_id)
    ).fetchone()
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"you already have a scenario named '{name}'")
    params_json = body.params.model_dump_json() if body.params is not None else row["params"]

    db.execute(
        """UPDATE saved_scenarios SET name = ?, params = ?, updated_at = datetime('now')
           WHERE id = ? AND user_id = ?""",
        (name, params_json, scenario_id, user["id"]),
    )
    db.commit()
    return _row_to_out(_get_owned(db, user["id"], scenario_id))


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    user: sqlite3.Row = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    _get_owned(db, user["id"], scenario_id)
    db.execute("DELETE FROM saved_scenarios WHERE id = ? AND user_id = ?", (scenario_id, user["id"]))
    db.commit()
