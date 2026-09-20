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
            # unknown commands are ignored -- keep the protocol small
    except WebSocketDisconnect:
        pass
