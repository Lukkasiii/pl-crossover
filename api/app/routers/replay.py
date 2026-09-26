"""The two-way replay socket: client sends play/pause/seek, server pushes
numbered snapshot frames built once per pair by `app.replay` and cached.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import get_settings
from ..db import connect
from ..replay import get_frames

router = APIRouter(tags=["replay"])

def _seek_through_target(frames: list[dict], cmd: dict) -> int:
    """Index of the last frame a `seek_through` should return.

    `week` names a round: the first round frame at or past that many games
    (the client of a `?week=` link knows the round, never its seq). `seq`
    names a frame directly. Either is clamped to the frame list.
    """
    if "week" in cmd:
        week = int(cmd["week"])
        for i, frame in enumerate(frames):
            if frame["type"] == "round" and frame["games"] >= week:
                return i
        return len(frames) - 1
    return min(max(int(cmd.get("seq", 0)), 0), len(frames) - 1)


BASE_FRAME_INTERVAL = 0.2  # seconds per frame at 1x -- a full season runs ~80-90s
MIN_SPEED, MAX_SPEED = 1.0, 50.0


@router.websocket("/ws/replay")
async def replay(websocket: WebSocket, pair: int) -> None:
    await websocket.accept()

    settings = get_settings()
    con = connect(settings.db_path)
    try:
        frames = get_frames(con, settings.db_path, pair)
    finally:
        con.close()

    if frames is None:
        await websocket.send_json({"type": "error", "message": f"no season pair with id {pair}"})
        await websocket.close(code=1008)
        return

    await websocket.send_json({"type": "init", "pair_id": pair, "total_frames": len(frames)})

    seq = 0
    speed = 1.0
    playing = False
    try:
        while True:
            interval = BASE_FRAME_INTERVAL / speed if playing else None
            try:
                cmd = await asyncio.wait_for(websocket.receive_json(), timeout=interval)
            except asyncio.TimeoutError:
                if seq >= len(frames):
                    await websocket.send_json({"type": "done"})
                    playing = False
                    continue
                await websocket.send_json(frames[seq])
                seq += 1
                continue

            action = cmd.get("cmd")
            if action == "play":
                speed = min(max(float(cmd.get("speed", speed)), MIN_SPEED), MAX_SPEED)
                playing = seq < len(frames)
                if not playing:
                    await websocket.send_json({"type": "done"})
            elif action == "pause":
                playing = False
            elif action == "seek":
                seq = min(max(int(cmd.get("seq", 0)), 0), len(frames) - 1)
                await websocket.send_json(frames[seq])
                seq += 1
            elif action == "seek_through":
                # Every frame from `from` through the target, in one message.
                # A deep link needs the whole round history up to its target
                # (the model panels plot every round so far), and fetching it
                # with one `seek` per frame was one round trip per frame (330 to reach round 30).
                # The frames already exist, built once at startup -- this is
                # a slice, not a recompute.
                target = _seek_through_target(frames, cmd)
                start = min(max(int(cmd.get("from", 0)), 0), target)
                await websocket.send_json({"type": "batch", "frames": frames[start : target + 1]})
                seq = target + 1
            # unknown commands are ignored -- keep the protocol small
    except WebSocketDisconnect:
        pass
