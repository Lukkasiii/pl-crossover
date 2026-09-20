from __future__ import annotations


def test_init_and_seek(client):
    with client.websocket_connect("/ws/replay?pair=1") as ws:
        init = ws.receive_json()
        assert init["type"] == "init"
        assert init["total_frames"] > 380  # 380 match frames + up to 38 round frames

        ws.send_json({"cmd": "seek", "seq": 0})
        frame = ws.receive_json()
        assert frame["seq"] == 0
        assert frame["type"] == "match"
        assert len(frame["table"]) == 20
        assert sum(row["games_played"] for row in frame["table"]) == 2  # first match: 2 teams on 1 game


def test_play_drains_every_frame_in_order_then_signals_done(client):
    with client.websocket_connect("/ws/replay?pair=1") as ws:
        init = ws.receive_json()
        total = init["total_frames"]

        ws.send_json({"cmd": "play", "speed": 50})
        seqs, types = [], []
        for _ in range(total):
            frame = ws.receive_json()
            seqs.append(frame["seq"])
            types.append(frame["type"])
        assert seqs == list(range(total))
        assert types.count("round") == 38
        assert types.count("match") == 380

        done = ws.receive_json()
        assert done["type"] == "done"


def test_round_frames_carry_all_four_metrics(client):
    with client.websocket_connect("/ws/replay?pair=1") as ws:
        ws.receive_json()  # init
        ws.send_json({"cmd": "play", "speed": 50})
        frame = None
        while frame is None or frame["type"] != "round":
            frame = ws.receive_json()
        assert frame["games"] == 1
        assert set(frame["metrics"]) == {"xg", "xgd", "gd", "points"}
        assert frame["weights"]["prior"] == 5.0
        assert "crossover_passed" in frame["metrics"]["xg"]


def test_table_ranks_are_a_strict_permutation_even_when_teams_are_out_of_step(client):
    """Match frames mix teams at different games_played counts whenever a
    postponement has put them out of step. live_rank as stored in team_state
    is only comparable within one games_played slice, so a frame's table must
    recompute a fresh 1..N ranking across whoever has kicked off rather than
    reusing each team's stored value -- otherwise two teams from different
    slices can land on the same rank while another number is skipped.
    """
    with client.websocket_connect("/ws/replay?pair=1") as ws:
        init = ws.receive_json()
        ws.send_json({"cmd": "play", "speed": 50})
        for _ in range(init["total_frames"]):
            frame = ws.receive_json()
            if frame["type"] != "match":
                continue
            started = [row for row in frame["table"] if row["games_played"] > 0]
            assert sorted(row["live_rank"] for row in started) == list(range(1, len(started) + 1))


def test_unknown_pair_closes_with_an_error(client):
    with client.websocket_connect("/ws/replay?pair=999") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
