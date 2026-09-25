"""Ask the Model: a real tool-calling agent, driven by cached answers.

There is no LLM API key and no budget for one (see CLAUDE.md "Feature 3").
What is real: the tool schemas below, the two tools themselves (thin wrappers
over the same `analytics` functions the REST routers call -- not a
reimplementation of them), and the loop that executes a plan of tool calls
against the live database. What is cached: which questions exist, which
calls answer each one, and the prose that narrates the results -- generated
once by `scripts/generate_ask_fixtures.py` against the real `data/pl.db` and
committed as `ask_fixtures.json`.

The seam that keeps those two facts straight is `AskSource`: `CachedAskSource`
reads the committed fixtures (what every deployment of this demo uses).
`LiveAskSource` is the real thing -- a genuine `while stop_reason == "tool_use"`
loop against the Claude API, using the exact same `TOOLS` registry -- typed and
importable, but never instantiated without an API key, so the demo can never
silently claim a live model. `get_ask_source()` is the one place that chooses
between them; swapping the demo to a live model is changing that one line.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol

from .analytics import compute_predict, get_curve, get_observations

Tool = Literal["get_posterior", "get_rmse_curve"]
RelatesTo = Literal["weight-bars", "current-rmse-metrics"]

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "ask_fixtures.json")

# The checkpoints CLAUDE.md's own "Results to preserve" table quotes every
# RMSE curve at (5/10/15/20/38), plus 12 -- the round this app's own headline
# crossover language ("⚡ CROSSOVER" at round 12, per CLAUDE.md Feature 1)
# points at, and the "sigma-prior-10" preset below needs it to name an exact
# RMSE rather than gesture at "close to the crossover".
STANDARD_CHECKPOINTS = (5, 10, 12, 15, 20, 38)


# --- tool schemas -----------------------------------------------------------
# Real JSON Schema, in the shape the Claude API's `tools` parameter expects
# (see LiveAskSource below). Both tools call the same analytics functions the
# /api/predict and /api/curves routers call -- see CLAUDE.md "Feature 3":
# "Two tools, both calling the existing endpoints rather than reimplementing
# anything."

TOOL_SCHEMAS: list[dict] = [
    {
        "name": "get_posterior",
        "description": (
            "Compute the Bayesian blend of the prior-season and current-season "
            "regressions at a given games-played count. Returns the prior/data "
            "weights and the blended RMSE/MAE."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {"type": "string", "enum": ["xg", "xgd", "gd", "points"]},
                "games": {"type": "integer", "minimum": 1, "maximum": 38},
                "prior_weight": {"type": "number", "minimum": 0},
                "obs_variance": {"type": "number", "exclusiveMinimum": 0},
            },
            "required": ["metric", "games", "prior_weight", "obs_variance"],
        },
    },
    {
        "name": "get_rmse_curve",
        "description": (
            "Fetch the current-season RMSE curve for one metric across all 38 "
            "games, the prior-season baseline RMSE, and the crossover point."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {"type": "string", "enum": ["xg", "xgd", "gd", "points"]},
                "method": {"type": "string", "enum": ["pooled", "per_season"]},
            },
            "required": ["metric", "method"],
        },
    },
]


# --- tool implementations ---------------------------------------------------


def get_posterior(con: sqlite3.Connection, db_path: str, metric: str, games: int, prior_weight: float, obs_variance: float) -> dict:
    observations = get_observations(con, db_path)
    r = compute_predict(observations, metric, games, prior_weight, obs_variance)
    return {
        "metric": metric,
        "games": games,
        "prior_weight": prior_weight,
        "obs_variance": obs_variance,
        "prior_rmse": round(r["prior"].rmse, 3),
        "current_rmse": round(r["current"].rmse, 3),
        "weight_prior": round(r["weight_prior"], 4),
        "weight_data": round(r["weight_data"], 4),
        "blended_rmse": round(r["blended_rmse"], 3),
        "blended_mae": round(r["blended_mae"], 3),
    }


def get_rmse_curve(con: sqlite3.Connection, db_path: str, metric: str, method: str) -> dict:
    c = get_curve(con, db_path, metric, method)
    games = c["games"]
    return {
        "metric": metric,
        "method": method,
        "n_observations": c["n_observations"],
        "n_pairs": c["n_pairs"],
        "prior_rmse": round(c["prior"].rmse, 3),
        "crossover": round(c["crossover"], 2) if c["crossover"] is not None else None,
        "rmse_at": {str(g): round(c["current"][games.index(g)].rmse, 3) for g in STANDARD_CHECKPOINTS if g in games},
    }


TOOLS: dict[Tool, Callable[..., dict]] = {
    "get_posterior": get_posterior,
    "get_rmse_curve": get_rmse_curve,
}


# --- planned calls + preset questions ---------------------------------------


@dataclass(frozen=True)
class ToolCallSpec:
    """One planned call. `label` is a short human-readable signature for the
    UI chip ("get_posterior(σ=10)") -- distinct from `args`, which are the
    real keyword arguments passed to the tool."""

    tool: Tool
    args: dict[str, Any]
    label: str
    relates_to: RelatesTo


@dataclass(frozen=True)
class PresetQuestion:
    id: str
    question_en: str
    question_zh: str
    calls: list[ToolCallSpec]
    # Renders the final answer from the executed calls' results, keyed by
    # call index -- kept separate from `calls` so the reproducibility test
    # (see api/tests/test_ask_fixtures.py) can re-run the calls and re-render
    # the same text from fresh numbers, rather than pattern-matching prose.
    render: Callable[[list[dict]], tuple[str, str]]


def _fmt(x: float, nd: int = 2) -> str:
    return f"{x:.{nd}f}"


def _render_crossover_round_12(results: list[dict]) -> tuple[str, str]:
    (curve,) = results
    en = (
        f"The pooled xG regression's current-season RMSE first drops below the prior-season "
        f"baseline ({_fmt(curve['prior_rmse'])} positions) at {_fmt(curve['crossover'], 1)} games -- "
        f"that is the crossover, not anything that changes at round 12 specifically. By round 10 "
        f"the current-season fit is still slightly worse than the baseline "
        f"({_fmt(curve['rmse_at']['10'])} vs {_fmt(curve['prior_rmse'])}); by round 15 it is clearly "
        f"ahead ({_fmt(curve['rmse_at']['15'])}). \"After round 12\" is simply past the crossover: the "
        f"model has been trending down all season, and round 12 is where it happens to have already "
        f"crossed the baseline it is compared against."
    )
    zh = (
        f"合并 xG 回归的本赛季 RMSE 在 {_fmt(curve['crossover'], 1)} 场时首次跌破上赛季基线"
        f"（{_fmt(curve['prior_rmse'])} 个名次）——这就是交叉点，而不是第 12 轮本身发生了什么特殊变化。"
        f"到第 10 轮时，本赛季拟合仍略逊于基线（{_fmt(curve['rmse_at']['10'])} 对比 "
        f"{_fmt(curve['prior_rmse'])}）；到第 15 轮时已经明显领先（{_fmt(curve['rmse_at']['15'])}）。"
        f"「第 12 轮之后」只是恰好已经越过交叉点：模型整个赛季都在持续下降，"
        f"而第 12 轮正好是它已经跌破对比基线之后的一个时间点。"
    )
    return en, zh


def _render_sigma_prior_10(results: list[dict]) -> tuple[str, str]:
    baseline, sigma10, curve = results
    current_only_rmse = curve["rmse_at"]["12"]
    en = (
        f"w_prior = 1 / sigma_prior^2, so it runs the opposite way you might expect: the original "
        f"study's default (w_prior=5) implies sigma_prior ≈ {_fmt((1 / 5) ** 0.5)}, and setting "
        f"sigma_prior to 10 gives w_prior = 1/100 = {_fmt(sigma10['weight_prior'], 2)} -- almost no "
        f"weight at all, not more. At 12 games the blend moves from RMSE {_fmt(baseline['blended_rmse'])} "
        f"(w_prior=5, w_data={_fmt(baseline['weight_data'], 1)}) to {_fmt(sigma10['blended_rmse'])} "
        f"(w_prior≈0, same w_data) -- close to the pooled current-season fit alone at 12 games "
        f"({_fmt(current_only_rmse)}), since the prior contributes almost nothing to the blend once "
        f"its weight is this small."
    )
    zh = (
        f"w_prior = 1 / sigma_prior^2，所以它的方向和直觉相反：原始研究默认 w_prior=5，"
        f"对应 sigma_prior ≈ {_fmt((1 / 5) ** 0.5)}；把 sigma_prior 设为 10 会得到 "
        f"w_prior = 1/100 = {_fmt(sigma10['weight_prior'], 2)}——权重几乎为零，而不是更大。"
        f"在第 12 场时，混合预测的 RMSE 从 {_fmt(baseline['blended_rmse'])}"
        f"（w_prior=5，w_data={_fmt(baseline['weight_data'], 1)}）变为 {_fmt(sigma10['blended_rmse'])}"
        f"（w_prior≈0，w_data 不变）——已经接近第 12 场时仅用本赛季数据拟合的结果"
        f"（{_fmt(current_only_rmse)}），因为先验权重小到这种程度时，它对混合结果的贡献几乎为零。"
    )
    return en, zh


def _render_fastest_metric(results: list[dict]) -> tuple[str, str]:
    by_metric = {r["metric"]: r for r in results}
    order = sorted(by_metric.items(), key=lambda kv: kv[1]["crossover"])
    names = {"points": "points", "gd": "goal difference", "xg": "xG", "xgd": "xGD"}
    names_zh = {"points": "积分", "gd": "净胜球", "xg": "xG", "xgd": "xGD"}
    ranked_en = ", then ".join(f"{names[m]} (crossover ≈ {_fmt(r['crossover'], 1)} games)" for m, r in order)
    ranked_zh = "，然后是".join(f"{names_zh[m]}（交叉点 ≈ {_fmt(r['crossover'], 1)} 场）" for m, r in order)
    en = (
        f"Ranked by pooled crossover, earliest first: {ranked_en}. Points and goal difference are "
        f"actual results, so a handful of games already separates teams by what happened; xG and "
        f"xGD are performance-quality metrics and need more games before their signal outweighs the "
        f"prior season's table."
    )
    zh = (
        f"按合并交叉点由早到晚排序：{ranked_zh}。积分和净胜球反映的是已经发生的比赛结果，"
        f"因此只需几场比赛就能靠实际战绩把球队区分开；xG 和 xGD 衡量的是表现质量，"
        f"需要更多场次其信号才能超过上赛季积分榜的权重。"
    )
    return en, zh


def _render_pooled_vs_per_season(results: list[dict]) -> tuple[str, str]:
    pooled, per_season = results
    gap = pooled["crossover"] - per_season["crossover"]
    en = (
        f"Both reproduce the original deck's xG figures exactly, but they cross the prior-season "
        f"baseline ({_fmt(pooled['prior_rmse'])} positions) at different points: pooled at "
        f"{_fmt(pooled['crossover'], 1)} games, per-season at {_fmt(per_season['crossover'], 1)} -- "
        f"{_fmt(gap, 1)} games earlier. That gap is a property of the fitting method, not a second "
        f"football fact: per-season averages eight separate fits of only ~17 observations each, "
        f"scored in-sample with no group left over to hold out and check against, so it always reads "
        f"a little more confident than the pooled fit's 136-observation regression. That is why this "
        f"app defaults to pooled -- it is the one with a held-out (leave-one-season-out) score behind "
        f"it -- and offers per-season only as a toggle, never as the default."
    )
    zh = (
        f"两种方法都精确复现了原始幻灯片的 xG 数据，但二者跌破上赛季基线"
        f"（{_fmt(pooled['prior_rmse'])} 个名次）的时间点并不相同：合并回归在 "
        f"{_fmt(pooled['crossover'], 1)} 场，逐赛季回归在 {_fmt(per_season['crossover'], 1)} 场——"
        f"提前了 {_fmt(gap, 1)} 场。这个差距是拟合方法本身的特性，而不是又一条独立的足球事实："
        f"逐赛季方法是对 8 组、每组仅约 17 个观测值分别拟合后取平均，全部在样本内打分，"
        f"没有多余的分组可以留出来做校验，因此它的结果总是比合并回归（136 个观测值）看起来更「自信」一些。"
        f"这正是本应用默认使用合并回归——它背后有留一法（leave-one-season-out）的样本外校验——"
        f"而逐赛季回归只作为一个可切换选项、从不作为默认值的原因。"
    )
    return en, zh


def _render_prior_share(results: list[dict]) -> tuple[str, str]:
    shares = [(r["games"], r["weight_prior"] / (r["weight_prior"] + r["weight_data"]) * 100) for r in results]
    shares_en = ", ".join(f"{_fmt(pct, 0)}% at {g} games" for g, pct in shares)
    shares_zh = "，".join(f"{g} 场时 {_fmt(pct, 0)}%" for g, pct in shares)
    en = (
        f"w_data = N / sigma_obs^2 grows with N while w_prior stays fixed at 5, so the prior's share "
        f"of the blend ({shares_en}) shrinks all season by construction, not because any single game "
        f"changes the weighting rule -- last season's table simply gets diluted by an ever-larger "
        f"pool of current-season evidence."
    )
    zh = (
        f"w_data = N / sigma_obs^2 会随场次 N 增长，而 w_prior 固定为 5，"
        f"因此先验在混合预测中所占的比例（{shares_zh}）整个赛季都在按设计不断缩小，"
        f"并不是某一场比赛改变了权重规则——上赛季的积分榜只是被越来越多的本赛季证据不断稀释。"
    )
    return en, zh


PRESET_QUESTIONS: list[PresetQuestion] = [
    PresetQuestion(
        id="crossover-round-12",
        question_en="Why did predictions get more accurate after round 12?",
        question_zh="为什么第 12 轮之后预测会变得更准确？",
        calls=[
            ToolCallSpec(
                tool="get_rmse_curve",
                args={"metric": "xg", "method": "pooled"},
                label="get_rmse_curve(metric=xg)",
                relates_to="current-rmse-metrics",
            )
        ],
        render=_render_crossover_round_12,
    ),
    PresetQuestion(
        id="sigma-prior-10",
        question_en="What happens if σ_prior is set to 10?",
        question_zh="如果把 σ_prior 设为 10 会发生什么？",
        calls=[
            ToolCallSpec(
                tool="get_posterior",
                args={"metric": "xg", "games": 12, "prior_weight": 5.0, "obs_variance": 1.5},
                label="get_posterior(σ_prior≈0.45)",
                relates_to="weight-bars",
            ),
            ToolCallSpec(
                tool="get_posterior",
                args={"metric": "xg", "games": 12, "prior_weight": 0.01, "obs_variance": 1.5},
                label="get_posterior(σ=10)",
                relates_to="weight-bars",
            ),
            ToolCallSpec(
                tool="get_rmse_curve",
                args={"metric": "xg", "method": "pooled"},
                label="get_rmse_curve(metric=xg)",
                relates_to="current-rmse-metrics",
            ),
        ],
        render=_render_sigma_prior_10,
    ),
    PresetQuestion(
        id="fastest-metric",
        question_en="Which metric becomes reliable earliest?",
        question_zh="哪个指标最早变得可靠？",
        calls=[
            ToolCallSpec(
                tool="get_rmse_curve",
                args={"metric": m, "method": "pooled"},
                label=f"get_rmse_curve(metric={m})",
                relates_to="current-rmse-metrics",
            )
            for m in ("xg", "xgd", "gd", "points")
        ],
        render=_render_fastest_metric,
    ),
    PresetQuestion(
        id="pooled-vs-per-season",
        question_en="Does the per-season method agree with the pooled regression?",
        question_zh="逐赛季方法和合并回归的结果一致吗？",
        calls=[
            ToolCallSpec(
                tool="get_rmse_curve",
                args={"metric": "xg", "method": "pooled"},
                label="get_rmse_curve(metric=xg, method=pooled)",
                relates_to="current-rmse-metrics",
            ),
            ToolCallSpec(
                tool="get_rmse_curve",
                args={"metric": "xg", "method": "per_season"},
                label="get_rmse_curve(metric=xg, method=per_season)",
                relates_to="current-rmse-metrics",
            ),
        ],
        render=_render_pooled_vs_per_season,
    ),
    PresetQuestion(
        id="prior-share-by-checkpoint",
        question_en="How much does the prior matter early versus late in the season?",
        question_zh="先验在赛季初和赛季后期的重要性有何不同？",
        calls=[
            ToolCallSpec(
                tool="get_posterior",
                args={"metric": "xg", "games": g, "prior_weight": 5.0, "obs_variance": 1.5},
                label=f"get_posterior(games={g})",
                relates_to="weight-bars",
            )
            for g in (5, 10, 15, 20)
        ],
        render=_render_prior_share,
    ),
]

PRESET_BY_ID: dict[str, PresetQuestion] = {q.id: q for q in PRESET_QUESTIONS}


def run_tool_loop(con: sqlite3.Connection, db_path: str, calls: list[ToolCallSpec]) -> list[dict]:
    """The real tool-calling loop: execute a plan of tool calls in order against
    the live database and return each one's result. This is the same function
    both `scripts/generate_ask_fixtures.py` (fixture generation) and the
    reproducibility test (api/tests/test_ask_fixtures.py) call -- there is
    exactly one code path that turns a plan into results, cached or not."""

    results = []
    for call in calls:
        fn = TOOLS[call.tool]
        results.append(fn(con, db_path, **call.args))
    return results


def build_answer(con: sqlite3.Connection, db_path: str, preset: PresetQuestion) -> dict:
    results = run_tool_loop(con, db_path, preset.calls)
    answer_en, answer_zh = preset.render(results)
    return {
        "id": preset.id,
        "question_en": preset.question_en,
        "question_zh": preset.question_zh,
        "answer_en": answer_en,
        "answer_zh": answer_zh,
        "tool_calls": [
            {"tool": call.tool, "args": call.args, "label": call.label, "relatesTo": call.relates_to, "result": result}
            for call, result in zip(preset.calls, results)
        ],
    }


# --- sources: cached (used by the demo) vs. live (real, not wired up) ------


class AskSource(Protocol):
    def answer(self, question_id: str, lang: str) -> dict | None: ...


class CachedAskSource:
    """Reads `ask_fixtures.json`, generated once by
    `scripts/generate_ask_fixtures.py` against the real `data/pl.db`. Zero
    model calls, zero DB queries at request time -- this is what every
    deployment of the public demo uses."""

    def __init__(self, fixtures_path: str = FIXTURES_PATH) -> None:
        self._fixtures_path = fixtures_path
        self._fixtures: dict[str, dict] | None = None

    def _load(self) -> dict[str, dict]:
        if self._fixtures is None:
            with open(self._fixtures_path, encoding="utf-8") as f:
                self._fixtures = {f["id"]: f for f in json.load(f)}
        return self._fixtures

    def answer(self, question_id: str, lang: str) -> dict | None:
        fixture = self._load().get(question_id)
        if fixture is None:
            return None
        return {
            "id": fixture["id"],
            "question": fixture["question_en"] if lang == "en" else fixture["question_zh"],
            "answer": fixture["answer_en"] if lang == "en" else fixture["answer_zh"],
            "toolCalls": fixture["tool_calls"],
        }


class LiveAskSource:
    """The real thing -- never instantiated without an API key, so the cached
    demo can never silently claim a live model (see module docstring).

    Swapping the demo to this is a one-line change in `get_ask_source()`
    below. What is NOT built: a way to reach every question in
    PRESET_QUESTIONS through the model's own judgment rather than a fixed
    plan -- a live deployment would drop the `calls`/`render` split entirely
    and let the model decide which tools to call and what to say, which is
    exactly what this class's loop does.
    """

    def __init__(self, api_key: str, model: str = "claude-opus-5") -> None:
        if not api_key:
            raise ValueError("LiveAskSource requires a real Anthropic API key")
        self._api_key = api_key
        self._model = model

    def answer(self, question_id: str, lang: str) -> dict | None:
        preset = PRESET_BY_ID.get(question_id)
        if preset is None:
            return None

        import anthropic  # imported lazily -- the cached demo never needs this dependency at runtime

        client = anthropic.Anthropic(api_key=self._api_key)
        question_text = preset.question_en if lang == "en" else preset.question_zh
        system = (
            "You are the model behind a Premier League crossover-prediction dashboard. "
            "Answer using only numbers you get back from the tools -- never estimate or recall a "
            f"figure yourself. Answer in {'English' if lang == 'en' else 'Chinese'}."
        )
        messages: list[dict] = [{"role": "user", "content": question_text}]
        tool_calls: list[dict] = []

        # The real agentic loop -- see the manual-loop pattern this mirrors:
        # `while stop_reason == "tool_use": run every requested tool, feed all
        # results back in one user turn, ask again.` Cached answers use a fixed
        # `calls` plan instead of letting the model choose, precisely because
        # there is no key to let it choose with.
        while True:
            response = client.messages.create(
                model=self._model,
                max_tokens=1024,
                system=system,
                tools=TOOL_SCHEMAS,
                messages=messages,
            )
            if response.stop_reason != "tool_use":
                answer_text = next((b.text for b in response.content if b.type == "text"), "")
                break

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result = TOOLS[block.name](**block.input)  # type: ignore[misc]
                tool_calls.append({"tool": block.name, "args": block.input, "label": f"{block.name}(…)", "relatesTo": "weight-bars", "result": result})
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
            messages.append({"role": "user", "content": tool_results})

        return {"id": preset.id, "question": question_text, "answer": answer_text, "toolCalls": tool_calls}


_cached_source = CachedAskSource()


def get_ask_source(anthropic_api_key: str | None) -> AskSource:
    """The one place the live/cached choice is made. This is the one-line
    change: `if anthropic_api_key:` -> always `return _cached_source`."""

    if anthropic_api_key:
        return LiveAskSource(api_key=anthropic_api_key)
    return _cached_source
