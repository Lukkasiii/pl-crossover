# PL Crossover — working notes

Read this before touching anything. It is the project's memory: what exists, why
it is shaped this way, and what is meant to happen next.

## What this is

A web application that answers one question: **when does the current season
start predicting the final table better than last season did?**

It comes out of a graduate sports-analytics study (Columbia MSE, Spring 2026)
that measured this at four checkpoints — games 5, 10, 15, 20 — in an Excel
workbook. The web version rebuilds the analysis on match-level data so the same
regression runs after every one of the 38 games, and streams the result as a
live, replayable dashboard.

It is also a portfolio piece, targeting a **Frontend Engineer Intern** role
(Dexmate). The JD asks for: React or Vue 3, TypeScript, REST APIs, real-time
visualization of telemetry, WebSocket, ECharts or D3, AI agents and AI-integrated
interfaces, CI/CD and automated testing, AI-assisted development tools, async
collaboration on GitHub, and "a personal project that shows you can self-teach".

**Stack, decided: React + TypeScript + Vite + ECharts.** The owner's résumé
claims React, TypeScript, WebSocket, FastAPI, PostgreSQL, Docker, CI/CD. This
repo is the evidence for those claims. Prefer the claimed stack over
alternatives, and prefer doing one thing properly over three things shallowly.

## The governing idea

Right now the hard parts all sit in the backend: the Bayesian model, the
WebSocket server. The frontend would mostly receive data and hand it to ECharts,
and with 38 rounds at one frame per round even the most naive implementation
works — which means an interviewer cannot tell this project apart from anyone
else's.

**So: move the hard problems into the browser, and make them visible within 30
seconds of opening the demo.** Depth beats breadth. Do not add pages or
features beyond what is listed here. Keep the backend thin.

## State

| Layer | Status |
|---|---|
| Understat fetcher | done, tested |
| ETL → SQLite | done, 14 tests passing |
| Model engine (OLS, LOSO, Bayesian, crossover) | done, reproduces the original study |
| 38-matchweek curves | done, `data/curves.json` |
| REST + WebSocket API | **next** |
| Auth + saved scenarios | next |
| React frontend | not started |
| Ask the Model panel | not started |
| Docker + CI + deploy | not started |

Four commits, pushed to `github.com/Lukkasiii/pl-crossover`.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python3 scripts/fetch_understat.py     # ~15s, nine seasons
python3 scripts/build_db.py            # -> data/pl.db
python3 scripts/build_curves.py --check
python3 -m pytest api/tests -q
```

## Things that will bite you

**Understat has no documented API and changed under us mid-project.** It used to
embed the fixture list as `var datesData = JSON.parse('\x5B...')` in the league
page HTML; every scraper on GitHub still looks for that, and it is gone. The
data now comes from:

```
GET https://understat.com/getLeagueData/EPL/<year>
X-Requested-With: XMLHttpRequest
```

Without that header the endpoint returns a 404 HTML page. The old HTML scrape is
kept as a fallback in `fetch_via_page`. If fetching breaks again, run
`scripts/diagnose_fetch.py` — it saves the raw response and reports which
extraction patterns still match — and `scripts/diagnose_tls.py` for TLS issues.
Do not delete these scripts.

**macOS + python.org Python has no CA bundle** until you run
`/Applications/Python\ 3.12/Install\ Certificates.command`. Every HTTPS call
fails with `CERTIFICATE_VERIFY_FAILED` until then. The fetcher detects this and
prints the fix.

**Index by games played, not matchweek.** Premier League matchweeks are not
aligned — games get postponed, and 2019/20 stopped for three months. `team_state`
is keyed by *that team's own* game count, ordered by kickoff time. Do not
"simplify" this to a calendar round number; it would silently corrupt every
season with a postponement.

**Promoted teams have no prior-season record.** Each season pair has exactly 17
common teams out of 20. They are excluded from the regression but kept in
`pair_teams` with `in_pair = 0`, so the UI greys them out rather than dropping
three clubs from the table with no explanation.

## Data model (`data/pl.db`, SQLite)

```
teams(id, name)
seasons(id, start_year, label)            2016..2024  ->  '2016/17'..'2024/25'
matches(id, understat_id, season_id, played_at,
        home_team_id, away_team_id, home_goals, away_goals,
        home_xg, away_xg)                 3,420 rows
team_state(season_id, team_id, games_played,       <- the core table
           wins, draws, losses, goals_for, goals_against, goal_diff,
           points, xg, xga, xgd, live_rank)        6,840 rows
season_pairs(id, prior_season_id, current_season_id, label, common_team_count)
pair_teams(pair_id, team_id, in_pair, final_rank)
users(id, email, password_hash, created_at)
saved_scenarios(id, user_id, name, params, created_at, updated_at)
```

`team_state` is one row per team per game played: the league table exactly as it
stood for that team at that moment. It is what the replay streams.

## The model (`api/app/model.py`)

Pure functions over numpy arrays. No database, no framework, no globals — keep it
that way, the API layer wraps it.

Final league position is regressed on a single predictor, pooled across all
season pairs (17 teams × 8 pairs = **136 observations**). Two scores, always
reported together:

- **in-sample** — what the original study used
- **leave-one-season-out** — refit with one pair held out, then predict it.
  Held-out error runs only 0.02–0.07 positions worse, so the original
  conclusions are not an artefact of fitting and scoring on the same rows.

The Bayesian view blends the two rank predictions by precision:

```
mu* = (w_prior · mu_prior + w_data · y_bar) / (w_prior + w_data)
w_prior = 1 / sigma²_prior   fixed at 5   (last season does not improve with time)
w_data  = N / sigma²_obs     sigma²_obs = 1.5, grows with games played
```

Prior share by checkpoint: 60% / 43% / 33% / 27% at 5 / 10 / 15 / 20 games —
matches the original study exactly.

**The weight crossover and the RMSE crossover are different events.** One is a
property of the model, the other of the data. Plot both; do not conflate them.

## Results to preserve

`scripts/validate_checkpoints.py` is a regression test against the original
study. All ten published figures reproduce from match-level data:

```
metric   prior RMSE  crossover      @5     @10     @15     @20     @38
xg            4.088       11.8   4.507   4.174   3.869   3.635   3.450
xgd           3.764       13.3   4.484   3.963   3.595   3.304   3.080
gd            3.821        8.5   4.274   3.774   3.434   2.903   2.329
points        3.947        6.5   4.218   3.546   3.068   2.585   1.744
```

The presentation said "crossover ≈ 12 games", interpolated from four checkpoints.
Match-level data puts it at **11.8**. That is the headline: the web version
answers, exactly, what the coursework could only bracket.

**The original deck mixes three methods.** Do not mix them in the app:

1. *Pooled regression* (deck slide 7) — 136 observations in one fit. Reproduced exactly.
2. *Per-season regression, averaged over 8 pairs* (slides 9, 11) — 3.85 / 4.42 / 4.02 / 3.69 / 3.41 for xG. Also reproduced exactly.
3. *Rank-based, no regression* (the goal-difference workbook, slide 11's GD line) — not exactly reproducible, quirks not worth carrying forward.

**Use method 1 as the default, offer method 2 as a toggle, never implement
method 3.** Three methodologies in one dashboard is indefensible in an interview.

---

# Build plan

Roughly 110 hours of work remain, including the overhead of learning React while
building. Planned as three weeks at 5–6 hours a day. **Ship a deployable v1 at
the end of Stage 2 and apply then** — the remaining depth lands before any
interview.

Every feature merges through its own PR, even though the only reviewer is the
author or an AI. That is the record of async collaboration the JD asks for.

## Feature 1 — Season Replay Engine (the core)

A ▶ Play button. The backend pushes data over WebSocket, and every panel on the
page moves together:

- teams move up and down the standings table
- the RMSE curve draws forward one step at a time
- the Bayesian weight bars slide: red prior shrinks 60% → 27% while blue current
  grows the opposite way
- at round 12 the page announces **⚡ CROSSOVER — current-season data now dominant**

**Replay per match, not per round.** 380 frames: standings update after every
match, model panels still update per round. Speeds from 1× to 50×.

Interview pitch: *"The server pushes frame by frame and several panels subscribe
to the same stream. That is the same architecture as a robot telemetry
dashboard, with match rounds as the data source."*

## Feature 2 — Tunable Prediction Engine

A control panel lets the user drag σ_prior (hard-coded as `w_prior = 5` in the
original study). Drag → debounce 300ms → REST → FastAPI recomputes the Bayesian
posterior → charts update.

Generate the frontend's TypeScript types from the FastAPI OpenAPI schema with
`openapi-typescript`. It shows you understand the frontend–backend contract
rather than hand-copying interfaces.

Controlled components, debouncing and loading/error states are good practice but
the JD does not name them — do not present them as JD requirements in an
interview.

## Feature 3 — Ask the Model (AI integration)

A question box at the bottom: *"Why did predictions get more accurate after round
12?"*, *"What happens if σ_prior is set to 10?"*. One agent, two tools
(`get_posterior`, `get_rmse_curve`) that call the existing endpoints. It answers
with the real numbers it gets back and highlights the related charts.

**No live LLM API — there is no key and no budget for one.** Build the full
agent code path (tool schemas, the tool-calling loop, streaming) and drive it
from a fixed set of preset questions whose answers were generated once and
committed as fixtures. The answer streams token by token from the cached
response. Swapping in a live API key must be a one-line change, and the README
says so plainly: *the tool-calling path is real, the model call is cached for a
zero-cost public demo.*

Never claim a live model in the README or an interview. The honest version is
already a good answer; a fake one is a disaster when probed.

Maps to **Required: AI agents and AI-integrated interfaces** (single agent with
tool-calling; multi-agent systems not covered).

## Feature 4 — Auth and saved scenarios

Kept deliberately, against the note in the scope that drops JWT/OAuth. It earns
its place only because it *unlocks* something: naming and saving a set of model
parameters, then loading and comparing them later.

- `passlib[bcrypt]` for password hashing. Not optional, not homemade.
- **Access token in memory on the client, refresh token in an httpOnly cookie.**
  Not localStorage — any XSS reads it. This is the single most defensible
  security decision in the project; be able to explain it.
- **Browser WebSockets cannot send an `Authorization` header.** Issue a
  short-lived single-use ticket from a REST endpoint and pass it as a query
  parameter, or use the `Sec-WebSocket-Protocol` subprotocol. Document the
  choice in the README — a genuine constraint and real interview material.
- **The dashboard stays public.** Replay, charts and σ tuning all work logged
  out; login only unlocks *saving*. A demo that opens on a login wall gets
  closed.
- Seed a demo account and put it at the top of the README.

## API surface

FastAPI, in `api/app/`, thin over `model.py`. Test with `TestClient`; a running
server should not be needed for the suite.

```
GET  /api/seasons                      season pairs, team counts
GET  /api/pairs/{id}/table?games=N     league table at N games, with live_rank
GET  /api/curves?metric=xg&method=pooled
                                       RMSE/MAE/R² per matchweek, prior baseline,
                                       crossover, LOSO series
POST /api/predict                      {metric, games, prior_weight, obs_variance}
POST /api/ask                          preset question id -> cached answer + tool trace
WS   /ws/replay?pair={id}            two-way: client sends play/pause/seek,
                                       server pushes numbered snapshot frames

POST /auth/register | /auth/login | /auth/refresh    GET /auth/me
GET/POST/PUT/DELETE /api/scenarios                   protected
```

### WebSocket frame protocol

Frames are **pure snapshots, never deltas** — that is what makes seeking
instant. One monotonic `seq` across both frame types. Build the frame list once
per pair at application startup and cache it; do not recompute per connection.

- `type: "match"` — one per match in chronological order (380). The full 20-row
  table as of that instant, each team at *its own* games-played count. Teams
  that have not started are flagged, not omitted.
- `type: "round"` — the model panels. **Emit round frame N when
  `min(games_played)` across all 20 teams reaches N**, which happens 38 times.

  Do **not** emit one every 10 match frames. Ten matches equals one round only
  if the league plays in strict round order, and it does not: postponements
  leave teams several games apart. Measured on this dataset, "every 10th match"
  fails to be a uniform checkpoint in 35 of 38 cases in 2020/21, 30 of 38 in
  2022/23, with teams up to 6 games apart. Using it would silently mix a team on
  12 games with a team on 18 inside one "round 15" RMSE.

  Round frames are therefore unevenly spaced in the sequence. That is correct.
  Total stays 418 frames.

  Each round frame carries, for all four metrics: current-season RMSE / MAE /
  R² at that games count, the prior-season baseline RMSE (constant, so the
  client can draw the red line without a REST call), the Bayesian prior/data
  weights, and a `crossover_passed` boolean so the ⚡ CROSSOVER highlight needs
  no client-side comparison.

- Client → server: `{"cmd":"play","speed":1..50}`, `{"cmd":"pause"}`,
  `{"cmd":"seek","seq":N}`. `seek` replies immediately with the snapshot at N;
  `pause` stops the stream without closing the socket.
- **No auth on this endpoint** — the replay is public data. The README documents
  the ticket pattern and the "browser WebSockets cannot send an Authorization
  header" constraint as how it *would* be gated; unused plumbing is not built.


## Frontend depth — this is what separates the project

### 1. Make the data flow heavy, then prove it holds up

The closest match to robot telemetry. The naive approach — `setState` on every
message, rebuild charts every frame — drops frames at 50×. Instead:

- buffer incoming messages, flush at most once per frame with `requestAnimationFrame`
- components subscribe only to their own slice of state through selectors
- create each ECharts instance once and update only the series that changed

Put Chrome Performance before/after screenshots and frame rates in the README.
Interview pitch: *"decouple the data arrival rate from the render rate"* — the
core problem of any telemetry dashboard.

### 2. Turn the replay into a real player

- play, pause, speed, draggable timeline; space and arrow keys work
- state lives in the URL (`?week=12&sigma=5`), so a refresh keeps your place and
  links are shareable
- **every frame is a full snapshot, not a delta.** 20 teams is tiny, so seeking
  never replays history. The client caches frames by sequence number; dragging
  backward is an instant cache hit
- the protocol is two-way: client sends play/pause/seek, server pushes numbered
  frames. Same shape as robot control — commands down, telemetry back

### 3. Survive disconnects

- auto-reconnect with exponential backoff, plus a status badge (live /
  reconnecting / offline)
- after reconnecting, resume from the last sequence number; drop duplicate or
  out-of-order frames
- unit-test the replay logic with fake timers and a mocked WebSocket; add a
  Playwright test that kills the socket and asserts the data is continuous
  after recovery

### 4. Interaction polish

- animate standings reorders with FLIP — **hand-write it at least once** so you
  can explain how it works; tween the points numbers
- linked highlighting: hover a team, every chart highlights it
- key the σ slider requests by σ with TanStack Query: out-of-order responses
  cannot overwrite each other, and dragging back to an earlier value is a cache
  hit. While dragging, keep the previous chart and fade it instead of flashing
  a loading state
- mock it up in Figma first (your own mockup is fine), build to it, and put the
  mockup next to the result in the README — the closest thing a solo project has
  to "collaborate with designers"
- design tokens as CSS variables, dark theme. A headless library like Radix plus
  your own styles; it shows more CSS skill than dropping in MUI

### 5. Make it visible in 30 seconds

- the live demo must open in one click. A demo mode driven by a recorded stream
  lets the frontend deploy as a static site. Nobody runs `docker compose up` to
  look at a portfolio piece
- top of the README: a 15-second GIF, the Lighthouse score, and bundle size
  before/after (import only the ECharts modules you use, lazy-load the Ask panel)
- a **Frontend decisions** section where each entry is problem → solution →
  numbers. Interviewers will mostly ask from this section

### Bonus, if time allows

- **Accessibility** (most intern candidates skip it, so it sets you apart):
  everything works from the keyboard; the crossover is announced through
  `aria-live`; every chart can switch to a data table; turn on ECharts `aria`
  and decal patterns so colour-blind users can tell prior from current
- **Responsive**: panels reflow at tablet width, charts resize with their
  container, `prefers-reduced-motion` respected
- **Ask panel**: batch streamed tokens per frame so the page does not jitter; a
  stop button; do not force-scroll to the bottom when the user has scrolled up;
  show tool calls as chips (`get_posterior(σ=10)` with its return value) and
  highlight the matching chart when a chip is clicked
- **Storybook**: the player, weight bars and connection badge in isolation

## Engineering layer

- **CI/CD**: GitHub Actions runs `eslint` + `tsc --noEmit` + Vitest + pytest,
  plus a Playwright smoke test (click Play → assert the standings table
  changed). Every merge to main auto-deploys the static demo.
- **PR workflow**: every feature merges through a PR with its review record
  kept. Maps to *async work (PRs, docs, written specs)* and *active use of
  collaboration platforms*.
- **One-command startup**: `docker compose up` starts the frontend and FastAPI
  together.

**README** covers: an architecture diagram (three paths — WebSocket stream,
REST, agent tool-calling); **how AI tools were used** (which parts Claude Code
generated, what was changed, which decisions were the author's); a
**self-teaching log** (what was learned for this project: WebSocket,
openapi-typescript, FLIP); and the GIF, numbers and Frontend decisions section.

## Not covered on purpose

Community products and open-source / technical-community experience (both Bonus)
have nothing to do with this project; forcing them in would dilute the
storyline. The sync half of "comfortable working async and sync" and
"collaborate with designers, backend engineers and robotics teams" are shown
through other experience — the Figma-first build is the closest proxy here.

## Stages

| Stage | Contents | ~hours |
|---|---|---|
| 1 | API: REST + WebSocket + auth + scenarios, TestClient suite | 14 |
| 2 | Frontend base, replay depth 1–2, demo mode, Docker, CI, README v1 → **deployable, apply now** | 45 |
| 3 | Reconnect, interaction polish, Figma, design tokens, auth UI | 30 |
| 4 | Ask the Model, README v2 with numbers, accessibility, Storybook | 21 |

## Style

- Comments explain *why*, never *what*. If a line needs a comment to say what it
  does, rewrite the line.
- No dead code, no commented-out blocks, no `utils.py` junk drawer.
- Errors say what to do next — see `CERT_HELP` in the fetcher for the tone.
- Commit in small, working steps with real messages. The commit graph gets read.
- Tests assert behaviour, not implementation. The existing suite generates two
  synthetic seasons and checks the ETL holds together (points = 3W + D, ranks
  form a 1..20 permutation, league goals for = goals against). Keep that bar.
- The author must be able to explain every line in an interview. If a piece of
  generated code is not understood, stop and work through it before moving on.

## Working style (token discipline)

This project runs on a metered plan. Optimise every turn for that:

- Read `CLAUDE.md` once per session. Do not re-read files you have already read
  in this session, and never paste file contents back into the conversation.
- Report results in five lines or fewer: what changed, tests passing, what is
  next. No code walkthroughs, no restating the plan, no summaries of files you
  just wrote — unless asked.
- Work in long autonomous stretches. Finish a whole stage, then report once.
  Ask only when a decision is genuinely blocking and not answered here.
- Prefer targeted edits over rewriting whole files.
- When a command fails, read the error and fix it; do not paste the full
  traceback into the conversation.
