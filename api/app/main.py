from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import ask, auth, curves, pairs, predict, replay, scenarios, seasons, teams

app = FastAPI(title="PL Crossover API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(seasons.router)
app.include_router(teams.router)
app.include_router(pairs.router)
app.include_router(curves.router)
app.include_router(predict.router)
app.include_router(ask.router)
app.include_router(replay.router)
app.include_router(auth.router)
app.include_router(scenarios.router)
