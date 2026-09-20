# PL Crossover

When does *this* season start telling you more than *last* season did?

Every August, pundits and models lean on last year's table. At some point in the
autumn that stops being the best available information — the new season has said
enough. This project finds that point, to the game, and lets you watch it happen
as a live-replayable dashboard: standings, a growing RMSE curve, and a Bayesian
weight bar that slides from "trust last season" to "trust this one."

It grew out of a graduate sports-analytics study that measured the same thing at
four checkpoints (games 5, 10, 15 and 20) in a spreadsheet. The web app rebuilds
that analysis on match-level data, at every one of the 38 games, and finds the
crossover exactly rather than bracketing it: **11.8 games**, not "≈12."

It is also a portfolio project built for a Frontend Engineer Intern application —
see [Frontend decisions](#frontend-decisions) for what that means in practice.

**Demo account** (only needed to save named parameter sets — see
[Auth and saved scenarios](#auth-and-saved-scenarios)):

```
email:    demo@plcrossover.dev
password: crossover-demo
```

Seed it into a local `data/pl.db` with `python3 scripts/seed_demo_account.py`
(idempotent — safe to re-run). It is not needed to use the dashboard itself:
replay, charts and the σ tuner are all public.

---

## Status

| | |
|---|---|
| Data pipeline | built, tested |
| Model engine | built, tested, reproduces the original study |
| REST + WebSocket API | built, 51 tests passing |
| React frontend | replay engine, standings, charts, seek/URL state, demo mode |
| Docker + CI | built |
| Auth + saved scenarios | built end to end — sign in/register, scenarios panel |
| Ask the Model (AI agent panel) | not started |

## Quickstart

**Docker (one command, needs the real backend):**

```bash
docker compose up --build
# frontend: http://localhost:5173
# api:      http://localhost:8000
```

**Local dev:**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn api.app.main:app --reload   # api on :8000

cd web && npm install
npm run dev                                     # frontend on :5173
```

`data/pl.db` is committed (< 1MB, already built and validated) so neither path
needs a live fetch from Understat to show real data. To rebuild it from scratch:

```bash
python3 scripts/fetch_understat.py     # ~15s, nine seasons
python3 scripts/build_db.py            # -> data/pl.db
```

**Static demo (no backend at all):**

```bash
cd web
npm run demo:data     # freezes data/pl.db into web/public/demo/*.json
npm run build:demo    # vite build --mode demo
npm run preview -- --mode demo
```

A demo mode driven by a frozen frame stream is what lets the frontend deploy as
a static site — nobody runs `docker compose up` to look at a portfolio piece.
`VITE_DEMO_MODE=true` (`.env.demo`) swaps `useReplaySocket` for `useDemoReplay`
at build time (`src/ws/useReplay.ts`); the component tree doesn't know which one
it's using. CI builds and deploys this to GitHub Pages on every push to `main`
(`.github/workflows/ci.yml`).

## Architecture

```
Browser
  ├── REST  ──────────────► FastAPI  ──────► SQLite (data/pl.db)
  │   /api/seasons, /api/pairs/{id}/table, /api/curves, /api/predict
  │
  └── WebSocket  ──────────► FastAPI  ──────► frame list, built once per
      /ws/replay?pair={id}                    pair at startup and cached
```

A third path — an agent that answers questions like "why did predictions get
more accurate after round 12?" by calling `/api/curves` and `/api/predict` as
tools — is planned (Feature 3) but not built yet; it will not use a live LLM
API (no key, no budget), so the honest version to ship is a real tool-calling
loop driven by cached answers, documented as such.

### WebSocket frame protocol

Frames are **pure snapshots, never deltas**, so seeking is just picking an
index. `type: "match"` (380 of them) carries the full 20-row table as of that
instant; `type: "round"` (38 of them, unevenly spaced — see comment in
`api/app/replay.py`) carries all four metrics' current RMSE/MAE/R², the
constant prior baseline, the Bayesian weights, and a `crossover_passed` flag,
so the client never has to compare numbers itself to know when to announce
"⚡ CROSSOVER." 1x plays a frame every 200ms (~80-90s per season); 50x is ~4ms
per frame, which is the actual load the render-decoupling below exists for.

## Auth and saved scenarios

**The dashboard stays public.** Replay, charts and the σ tuner all work
signed out. Signing in unlocks exactly one thing: naming and saving the
current `(metric, method, prior_weight, obs_variance)` so it can be reloaded
later. There is no login wall anywhere in front of the data.

**Access token in memory on the client, refresh token in an httpOnly cookie.**
Not localStorage — anything that can run JS on the page can read
localStorage, so an XSS payload would walk out with a live session. The
access token lives in a plain module-level variable (`src/auth/tokenStore.ts`)
and is gone on reload by design; a valid refresh cookie silently re-issues one
on mount. The refresh cookie itself is scoped to `/auth`, httpOnly and
same-site, so no JS — injected or not — ever reads it.

**The fetch wrapper refreshes on 401 and retries once, single-flight.** Every
panel on the dashboard can fire a request against an expired access token at
the same moment; without coordination each would race to POST `/auth/refresh`
against the same refresh cookie, and since refresh tokens are versioned
(`token_version`, bumped on logout) rather than usable indefinitely, whichever
refresh lands second would in some designs invalidate the first. One shared
in-flight promise (`src/api/client.ts`) means concurrent 401s trigger exactly
one refresh call; every request waiting on it retries with the same new
token. `src/api/client.test.ts` asserts the call count directly.

**No WebSocket auth ticket.** The spec this was built from calls for issuing
a short-lived, single-use ticket from a REST endpoint (browsers can't attach
an `Authorization` header to a WebSocket handshake) so `/ws/replay` could be
gated per-user. It isn't built: `/ws/replay` streams public replay data with
no per-user state, so there is nothing to gate. If the socket ever needed to
carry account-specific state, the ticket pattern above — or the
`Sec-WebSocket-Protocol` subprotocol, which can also carry a token in the
handshake — is what would gate it; building the endpoint unused would just be
dead plumbing.

## Frontend decisions

Each entry is problem → solution → number, in the order they were built.

**Problem: at 50x, a naive `setState` per WebSocket message drops frames.**
`useReplaySocket` mutates a `FrameCache` (plain class, outside React) on every
message and only calls `setState` once per `requestAnimationFrame`, so the
render rate is capped at the display's refresh rate regardless of how fast the
socket delivers — 20 messages/sec at 1x, ~250/sec at 50x, one commit either way.

**Problem: reading that cache during render, through a ref, can tear under
concurrent rendering.** React docs are explicit that a ref's `.current` isn't
safe to read synchronously in a component body. Read it through
`useSyncExternalStore` instead — the primitive built for exactly this shape (an
external, imperatively-mutated source that still needs a consistent read during
render). `FrameCache.getSnapshot` memoizes on `(version, viewSeq)` so it returns
the same object reference between real changes, which `useSyncExternalStore`
requires to avoid re-rendering forever.

**Problem: scrubbing the timeline needs to feel instant, but a fresh jump to an
unplayed part of the season needs the model's full history up to that point,
not just the one frame at that index.** Every frame the socket has ever sent is
kept in the cache. Seeking to an already-seen `seq` is a pure cache read — no
network. Seeking past what's streamed in fetches the gap frame-by-frame
(`{"cmd":"seek","seq":i}` in a loop over the same socket) before committing
state once, so the RMSE curve and weight bars rebuild correctly instead of
jumping straight to a number with no history behind it. Scrubbing *backward*
also correctly hides round frames that are later in the stream than the
scrubbed-to position — the point is watching the model's confidence grow, and
that breaks if scrubbing back reveals the ending early.

**Problem: a refresh loses your place, and there's nothing to share.**
`?week=` mirrors the current round; loading with `?week=15` in the URL
scans forward (silently, via the same seek machinery) until that round has
streamed in, then jumps. `sigma` isn't in the URL yet — no control sets it
until Feature 2 (tunable σ_prior) exists, and an inert query param is worse
than none.

**Bundle size:** 791KB JS / 261KB gzip after tree-shaking ECharts to just the
line/bar charts and components this app uses (`echarts/core` + named imports,
not `import * as echarts from "echarts"`). Not yet code-split; the Ask panel
(Feature 3) is the obvious lazy-load candidate once it exists.

**Chrome Performance before/after and a Lighthouse score are not filled in
yet** — they belong here once there's a deployed demo to measure against
rather than a local dev server.

## The model

`api/app/model.py` is pure functions over numpy arrays — no database, no
framework, no globals — so the maths is testable on its own.

Final league position is regressed on a single predictor, pooled across all
season pairs (17 common teams × 8 pairs = 136 observations). Promoted teams have
no prior-season Premier League record, so they sit out the fit; they are kept in
`pair_teams` with `in_pair = 0` so the UI can grey them out instead of quietly
dropping three clubs from the table.

Two scores are reported side by side:

- **In-sample** — what the original study used. The right answer to "how much of
  final position does this metric explain?"
- **Leave-one-season-out** — refit with one season pair held out, then predict
  it. The right answer to "would this have worked on a season it never saw?"

The second one is not in the original write-up. It is shown next to the first so
the gap is visible rather than assumed away.

The Bayesian view combines both predictors by precision:

```
mu* = (w_prior · mu_prior + w_data · y_bar) / (w_prior + w_data)
w_prior = 1 / sigma²_prior   (fixed — last season does not get more informative)
w_data  = N / sigma²_obs     (grows with games played)
```

Note that the weight crossover and the RMSE crossover are different events: one
is a property of the model, the other a property of the data. The dashboard
plots both.

## Reproducing the original study

`scripts/validate_checkpoints.py` runs the engine over the original checkpoint
spreadsheet and checks it against the ten figures published in the final
presentation. All ten reproduce; see the script for the full table. Held-out
error is only 0.02–0.07 positions worse than in-sample throughout, so the
original conclusions are not an artefact of fitting and scoring on the same 136
rows.

## Tests

```bash
python3 -m pytest api/tests -q   # 50 tests: model, API, auth, replay protocol
cd web && npm run test           # Vitest: FrameCache, zone-band config, auth refresh
cd web && npx tsc -b && npm run lint
```

The Python suite generates two complete synthetic seasons, runs the real ETL
over them and checks the output holds together: points equal 3W + D, ranks form
an exact 1..20 permutation in every slice, league-wide goals scored equal goals
conceded. Fixtures are written to a temp directory, so a test run can never be
mistaken for real Understat output.

## Self-teaching log

What was new for this project, going in: WebSocket as a two-way protocol
(commands down, snapshots back) rather than a one-shot subscription;
`openapi-typescript` / `openapi-fetch` for generating a typed REST client from
FastAPI's own schema instead of hand-copying interfaces; `useSyncExternalStore`
for reading a ref-based cache safely during render, which came up specifically
because oxlint's `react(refs)` rule caught a ref read that would otherwise have
shipped.

## Getting the data

Understat has no documented API. It used to render the fixture list into the
league page as a hex-escaped JSON blob assigned to `var datesData`; that is what
most scrapers in the wild still look for, and it is gone. The page now ships
nearly empty and the frontend calls an endpoint:

```
GET https://understat.com/getLeagueData/EPL/<year>
X-Requested-With: XMLHttpRequest
```

That header is the whole guard — without it the endpoint returns a 404 HTML
page. The response carries `dates` (380 fixtures), `teams` (per-team 38-match
history with npxG, xpts, ppda, deep) and `players`. The old HTML scrape is kept
as a fallback, so if the endpoint moves the fetcher degrades instead of failing.

## Troubleshooting

**`CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate`** — the
python.org build of Python on macOS ships without a certificate bundle. Run the
installer's own script once:

```bash
/Applications/Python\ 3.12/Install\ Certificates.command
```

**`no datesData blob found` / a 404 from the endpoint** — Understat changed
something. `scripts/diagnose_fetch.py` fetches one season, saves the raw
response to `data/raw/_debug_page.html`, and reports which extraction patterns
still match. `scripts/diagnose_tls.py` separates a TLS problem from a network
one.

## Indexing by games played, not matchweek

Premier League matchweeks are not aligned in practice — games get postponed and
replayed weeks later, and in 2019/20 the whole season stopped for three months.
The index is each team's own game count, ordered by kickoff time, so `team_state`
holds one row per team per game played: the league table exactly as it stood for
that team at that moment. That table is what the dashboard streams.

## Layout

```
scripts/
  fetch_understat.py         match-level xG, standard library only
  build_db.py                ETL -> SQLite
  export_openapi.py          dumps FastAPI's schema for openapi-typescript
  export_demo_frames.py      freezes the replay into web/public/demo/*.json
  validate_checkpoints.py    regression test against the original study
  seed_demo_account.py       creates/resets the README's demo login
api/
  app/model.py                OLS, leave-one-season-out, Bayesian blend, crossover
  app/replay.py                builds and caches the 418-frame list per pair
  app/routers/                 REST + WebSocket endpoints
  tests/
web/
  src/ws/                     useReplaySocket, FrameCache, URL-state sync
  src/demo/                   useDemoReplay (static-JSON stand-in, same shape)
  src/charts/                 ECharts panels (RMSE curve, metric bars, weights)
  src/components/             standings table, zone bands, timeline, controls
  src/auth/                   AuthContext, in-memory token store
  src/components/auth/        sign-in/register panel, saved-scenarios panel
  src/api/client.ts            openapi-fetch client + single-flight 401 refresh
data/
  pl.db                       built database (committed, < 1MB)
  excel/                      the original coursework workbooks
  raw/                        fetched match data (gitignored)
```

## Sources

Match-level xG from [Understat](https://understat.com). The original study also
used [FBref](https://fbref.com) for goal difference and final standings; those
are now derived from the match data directly.
