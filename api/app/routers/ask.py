from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..ask import get_ask_source
from ..config import Settings, get_settings
from ..schemas import AskOut, AskRequest

router = APIRouter(tags=["core"])


@router.post("/api/ask", response_model=AskOut)
def ask(body: AskRequest, settings: Settings = Depends(get_settings)) -> AskOut:
    source = get_ask_source(settings.anthropic_api_key)
    result = source.answer(body.question_id, body.lang)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no preset question with id {body.question_id!r}")
    return AskOut(**result)
