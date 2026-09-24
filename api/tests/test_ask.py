from __future__ import annotations


def test_known_question_returns_answer_and_tool_trace(client):
    r = client.post("/api/ask", json={"question_id": "crossover-round-12"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "crossover-round-12"
    assert body["question"] and body["answer"]
    assert len(body["toolCalls"]) == 1
    call = body["toolCalls"][0]
    assert call["tool"] == "get_rmse_curve"
    assert call["args"] == {"metric": "xg", "method": "pooled"}
    assert call["label"] == "get_rmse_curve(metric=xg)"
    assert call["relatesTo"] == "current-rmse-metrics"
    assert "crossover" in call["result"]


def test_unknown_question_is_404_not_a_silent_empty_answer(client):
    r = client.post("/api/ask", json={"question_id": "not-a-real-question"})
    assert r.status_code == 404


def test_lang_switches_the_cached_text_not_just_the_tool_trace(client):
    en = client.post("/api/ask", json={"question_id": "fastest-metric", "lang": "en"}).json()
    zh = client.post("/api/ask", json={"question_id": "fastest-metric", "lang": "zh"}).json()
    assert en["question"] != zh["question"]
    assert en["answer"] != zh["answer"]
    # The numbers came from the same cached tool trace either way -- only the
    # prose is localized.
    assert en["toolCalls"] == zh["toolCalls"]


def test_default_lang_is_english(client):
    r = client.post("/api/ask", json={"question_id": "crossover-round-12"}).json()
    assert r["question"] == "Why did predictions get more accurate after round 12?"


def test_every_preset_question_answers(client):
    from app.ask import PRESET_QUESTIONS

    for preset in PRESET_QUESTIONS:
        r = client.post("/api/ask", json={"question_id": preset.id})
        assert r.status_code == 200, preset.id
        assert r.json()["toolCalls"], preset.id
