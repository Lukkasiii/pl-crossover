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
seconds of opening the demo.** Depth beats breadth. Keep the backend thin.

Through Stage 4 this meant one page. **v2 (Stage 5) splits it into seven
routes** — see [v2 — multi-page dashboard](#v2--multi-page-dashboard) below
for why and for the routes, design tokens and i18n contract that govern
everything built from here on. The "depth beats breadth" rule still applies
*within* each page; it no longer means *one* page.

## State

| Layer | Status |
|---|---|
| Understat fetcher | done, tested |
| ETL → SQLite, players table | done, 18 tests passing |
| Model engine (OLS, LOSO, Bayesian, crossover) | done, reproduces the original study |
| 38-matchweek curves | done, `data/curves.json` |
| REST + WebSocket API | done, `api/tests` passing |
| Auth + saved scenarios | done end to end — register/login/refresh, scenarios CRUD |
| React frontend — replay engine, standings, charts, tuner, auth UI, demo mode | done (Stages 1–4) |
| Docker + CI + deploy (static demo on GitHub Pages) | done |
| Multi-page shell: routing, sidebar nav, design tokens (light theme), i18n | done (Stage 5) |
| /season, /model content | done — the Stage 1–4 dashboard's panels split across the two |
| Overview, Teams, Compare, Method page content | done (Stage 6) |
| Ask the Model panel | not started |

Pushed to `github.com/Lukkasiii/pl-crossover`.

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

**A mid-season transfer's row cannot be split back apart.** Understat's raw
player payload (`data/raw/understat_EPL_<year>.json`'s `players` array, 17
fields, 4,806 player-seasons across nine seasons) reports one row per player
per season, not per club -- a player who changed clubs mid-season gets a
single row with `team_title` comma-separated ("Aston Villa,Manchester
United", 97 rows / 2.0% of the total) and every stat on it (minutes, goals,
xG, ...) summed across both clubs. There is no per-club breakdown anywhere
in the payload to split it back apart with.

**Decision: attribute that row to no club, not to the first one listed.**
`players.team_id` is `NULL` for these 97 rows rather than a guess. The
alternative -- attributing to `team_title.split(",")[0]` -- would silently
put some fraction of a player's goals-for-a-different-club onto a roster
that never had them, a wrong number presented as a real one. `NULL` costs a
squad list one row it can't otherwise place, which the UI states outright
rather than hiding; a plain `WHERE team_id = ?` already excludes them from
every per-club roster/aggregate for free, so there is no separate filter a
caller could forget.

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
players(season_id, player_id, name, team_id,       <- team_id NULL for a
        position, games, minutes, goals, xg,          mid-season transfer,
        assists, xa, shots, key_passes, npg, npxg,     see above -- 4,806 rows,
        xg_chain, xg_buildup,                          97 with team_id NULL
        yellow_cards, red_cards)
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


## v2 — multi-page dashboard

Stages 1–4 shipped one page: header, replay dashboard, prediction tuner,
scenarios panel, all stacked in `App.tsx`. That was correct while the frontend
was proving out the hard real-time problems (Feature 1–3 above). It stops
being correct once there is more to show than one page can hold without
diluting the 30-second read — a wall of panels reads as *more*, not as
*deeper*. v2 gives each concern its own route instead.

### Routes

| Route | Content |
|---|---|
| `/` | Overview — landing page, the 30-second pitch, links into the rest |
| `/season` | Season Replay Engine — the Stage 1–4 dashboard (replay, RMSE curve, prediction tuner, standings) moved here unchanged |
| `/model` | The Bayesian model explained: the blend formula, prior-share-by-checkpoint table |
| `/teams` | All teams, one list |
| `/teams/:slug` | One team's history across season pairs |
| `/compare` | Side-by-side: two teams, or two season pairs |
| `/method` | The three methodologies (pooled / per-season / rank-based) and why only two ship — see "Results to preserve" above |
| `/scenarios` | Saved scenarios — the Stage 4 auth + scenarios panel moved here unchanged. Auth-gated *for saving*, same rule as before: signed out shows a sign-in prompt inline, never a redirect wall |

Stage 5 built the shell and the navigation for all seven routes; `/season`
and `/scenarios` carried real content from the start (the existing
components, relocated, not rewritten), and the other five were placeholders
— reachable, correctly routed, correct page title — until Stage 6 filled
them in. `PlaceholderPage.tsx` is now used by nothing and was deleted.

Every route is lazy-loaded (`React.lazy` + `Suspense`). `/` needs no ECharts
at all — it was the biggest chunk of the pre-v2 bundle sitting on the one
route that least needed it.

**Deep links need a static-hosting fallback.** The demo deploys to GitHub
Pages (`web/dist`, no server, no rewrites) — a direct hit or refresh on
`/pl-crossover/season` 404s unless GH Pages has something to fall back to.
`npm run build:demo` now runs a `postbuild:demo` step that copies
`dist/index.html` to `dist/404.html`; GH Pages serves that for any unknown
path, the bundle loads, and `BrowserRouter` renders the real route from
`window.location` once it's up. Don't remove this when touching the demo
build — it's not dead weight, it's the only thing making `/season` or
`/scenarios` survive a refresh on the deployed site.

Verified by `e2e/production-base.spec.ts`, run via `npm run
test:e2e:prod-base` (CI job `e2e-prod-base`, gating `deploy-demo`): it
builds the real demo bundle and serves it through
`e2e/ghPagesStaticServer.mjs`, which reproduces GitHub Pages' actual
semantics (exact-file-or-directory-index-or-404.html-with-404-status, no
redirect — see "Deep links get a real 200" below) rather than trusting
`vite preview`'s more permissive built-in SPA fallback — the two are not
the same thing, and only one of them is what production does. It checks
all seven sidebar routes both by clicking the nav link (does the URL still
say what it should a couple of seconds later, once the replay has been
started and its first `?week=` write has had time to fire) and by hitting
the URL directly. This is the only place that runs the app under the real
`/pl-crossover/` basename — see the `useUrlParamWriter` basename bug below,
which was invisible everywhere else.

**Deep links get a real 200, not just a recovered one.** The 404.html
fallback above makes a direct hit on `/season` render the right page, but
the HTTP status line still says 404 and the `<title>` is still the generic
root one — a browser-driven human never notices (the SPA boots and fixes
both), but a crawler or a link-unfurler (Slack, LinkedIn) reads the status
and the as-delivered HTML, never runs the JS, and so never sees either
correction. That defeats half the reason to have routes at all: nothing
indexes them, and a pasted link never previews right.

Weighed three ways: serve a real 200 for known routes via host rewrites
(GitHub Pages has none); render nothing and accept the tradeoff (the
status quo, and a bad one for a portfolio piece meant to be linked into);
or pre-render each known route's `index.html` at build time so the file
GitHub Pages finds *is* a genuine 200. Only the third keeps GitHub Pages,
so `scripts/prerender-routes.mjs` (run from `postbuild:demo`, after the
404.html copy) takes the built `dist/index.html` and writes
`dist/<route>/index.html` for each of the seven known static routes, with
the `<title>`, description, and OG/Twitter tags swapped to that route's own
copy. It does not run React or fetch data — the JS bundle and its absolute
`/pl-crossover/...` asset paths are identical in every copy, so the SPA
boots and renders the real, live page exactly as before; only the
crawler-visible `<head>` differs, in English regardless of `?lang=` (there
is no static way to serve two languages from one path on GitHub Pages, and
picking one deterministic default beats picking none). `/teams/:slug`
still has no fixed list of slugs to enumerate at build time, so it keeps
relying on the 404.html fallback alone.

This also meant fixing `ghPagesStaticServer.mjs`: it only ever tried an
exact file match, because until this point nothing but `dist/index.html`
existed to find. Real GitHub Pages resolves a directory-style path against
`<path>/index.html` when no exact file matches (ordinary static-host
behaviour, the same "try `$uri`, then `$uri/index.html`" any `try_files`
config uses) — the harness now does the same, or it would "reproduce GitHub
Pages' actual semantics" for everything except the one behaviour this
feature depends on. Confirmed by
`e2e/production-base.spec.ts`'s direct-hit tests (now expecting 200 for all
seven, not 404) and a new test that fetches each route's raw HTML with no
browser JS involved and checks its `<title>` differs from the root's.

### Design system

Locked at Stage 5; every later page is built on it, don't relitigate it.

- **Light surfaces, not dark** (colours only — never the lion mark or the
  "Premier League" wordmark): page `#FFFFFF`, a slightly recessed app
  backdrop behind the cards `#F7F7F9`, card `#FFFFFF` with a `#E4E4E7`
  border, ink primary `#18181B` (17.7:1 on white), ink secondary `#52525B`
  (7.7:1). `#37003C` is UI chrome only — the sidebar (a solid block, white
  text), page headings, primary buttons, the Champions League accent — never
  a data/chart-series colour: at L 0.24 it fails the chart palette's
  lightness band and reads as black in a line.
- **Chart series, one fixed set, five colours, assigned in order, never
  cycled**: `#7C3AED` purple, `#E90052` Premier League pink, `#0D9488` teal,
  `#D97706` amber, `#2563EB` blue. Validated through six checks — worst
  adjacent CVD ΔE 9.5 (deuteranopia), 24.3 (normal vision), every one ≥ 3:1
  on the white surface. Season/model semantics (current vs. prior vs.
  blended) draw their `--green`/`--red`/`--blue`/`--gold` token values from
  this same set rather than a literal green/red, so every colour in the app
  traces back to one of these five plus the UI-chrome purple.
- **Zone bands are exact tints from that palette**, not colour-mixed:
  Champions League `#F3E8FF`, Europa `#FEF3C7`, Conference `#CCFBF1`,
  relegation `#FFE4E6`, ink primary ≥ 14:1 on every one. Drawn as a full-row
  tint plus a 3px saturated border — the border lives on the row's first
  cell, not the `<tr>` itself, because a border set directly on a table row
  does not reliably paint under `border-collapse: collapse` in every engine
  (Safari in particular; verified with Playwright's WebKit browser, not just
  Chromium). Every foreground/background pairing must pass WCAG AA; axe
  (`e2e/accessibility.spec.ts`) checks this on every PR, not just at design
  time.
- **Type ramp, line heights, and a 4px spacing scale**, all as CSS custom
  properties. The Stage 1–4 CSS used one-off `px` values throughout
  (`gap: 16px`, `padding: 24px`, …); that inconsistency, not missing
  typefaces, was the reason the page didn't read as one system. Keep the
  existing typefaces (Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono).
- **Left sidebar navigation as the shell**, collapsing to a top drawer at
  narrow widths. Current route highlighted, every entry keyboard-reachable
  (tab order + visible focus, not just clickable).

### i18n contract

English and Chinese, switcher in the header, every UI-chrome string keyed
through a dictionary (`src/i18n/`). Numbers and dates go through `Intl`, not
hand-formatted.

- **Locale lives in the URL** (`?lang=en` / `?lang=zh`), not `localStorage` —
  a shared link must render in the language the sender saw, and a refresh
  must not silently flip language on the visitor.
- **`?lang=` and `?week=` are two independent writers on the same URL —
  route them through one hook (`src/routing/useUrlParamWriter.ts`), not two
  separate `useSearchParams` calls.** Caught by hand, not by the suite:
  switching language while on `/season` bounced to `/`, because
  react-router's `setSearchParams`/relative `"?..."` navigation resolves
  against the *nearest matched route's static path* — for `LocaleProvider`
  (mounted above `<Routes>`) that path is empty, so it silently lands on
  `/`. A second bug showed up fixing the first: writing an *absolute*
  pathname from each hook's own `useLocation()` snapshot dropped whichever
  param wrote second, because the two hooks could each capture `location`
  from a render one tick behind the other's already-committed write.
  `useUrlParamWriter` fixes both by reading/writing `window.location`
  directly (always current, unlike a React-tracked snapshot) and navigating
  to an explicit `{ pathname, search }`. Any future `?param=` needs to go
  through it too, not a fresh `useSearchParams`.

  **A third bug in the same hook, only visible under a real basename:**
  `window.location.pathname` is the full browser path, basename included
  (`/pl-crossover/season`); `<BrowserRouter basename>` expects `navigate()`'s
  `pathname` *without* it and prepends the basename itself. Passing the full
  path double-prepended it — `/pl-crossover/pl-crossover/season` matched no
  route and fell through to the `*` → `<Navigate to="/">` catch-all, so
  clicking into `/season` on the deployed demo silently bounced back to `/`
  a few seconds later (once autoplay's first `?week=` write fired).
  `useUrlParamWriter` now strips `import.meta.env.BASE_URL` before handing
  the pathname to `navigate()`. **This is exactly why the dev-mode suite
  (`e2e/*.spec.ts`, base `"/"`) cannot be trusted for anything that touches
  the URL**: stripping a basename of `"/"` is a no-op, so a broken and a
  correct implementation are indistinguishable there. Anything that reads or
  writes `window.location`/`navigate()` needs `e2e/production-base.spec.ts`
  (below) to actually prove it, not just the main suite going green.
- **Domain notation is not UI chrome and is not translated**: `w_prior`,
  `σ_prior`, RMSE, MAE, R², xG, xGD, GD are standard statistical/football
  notation, the same in both languages, the same way a formula wouldn't be
  translated mid-derivation. Button labels, headings, nav entries, form
  labels, empty states and error messages are chrome and are translated.
- **Test hooks are `data-testid`, never locale-dependent text.** The
  Playwright specs predate i18n and located elements by visible text
  (`getByRole(..., { name: ... })`) — that breaks the instant a string goes
  through the dictionary. Every element an e2e spec touches now carries a
  stable `data-testid` (or, where the accessible name itself needs testing,
  a state attribute like `data-state="playing"` instead of matching the
  label text). This was migrated *before* strings were extracted, in its own
  commit, with the suite green on English text only, specifically so the
  extraction commit couldn't hide a locator regression inside a string diff.

### Fixed: Safari grey chart

`theme.ts` used to read CSS custom properties once at module load
(`getComputedStyle(document.documentElement)`) and bake the resolved
colours into a `colors`/`fonts` constant, imported frozen by every chart.
On Safari this had been observed to occasionally resolve before the
stylesheet was fully applied, so a chart built its option from
empty-string colours and rendered grey until a full page reload. Root
cause was never fully confirmed (Safari's `<link rel=stylesheet>`/
module-execution ordering is timing-dependent, not reliably reproducible
locally) — but freezing the read at the earliest possible point (module
import, before React has even mounted anything) was certain to be wrong
regardless of the exact timing gap. `getColors()`/`getFonts()` now
re-resolve on every call; each chart calls them inside the `useMemo` that
builds its option, and `EChart.tsx` calls `registerEchartsTheme()` right
before `echarts.init()` — both meaningfully later than module evaluation.
Unit-tested in `theme.test.ts` via an injectable root, without a DOM.

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

### 1b. Standings table: make position mean something

A bare rank column is a list of numbers. Band the table by what each place
actually wins or costs, so a glance reads as football rather than as data:

- 1st — champion: a distinct marker, not just a colour
- 1st-4th — Champions League
- 5th — Europa League
- 6th — Conference League
- 18th-20th — relegation

Draw the bands as a full-row tint plus a 3px saturated border (see the
Design system section's exact zone hex values) — not just a rail, which
under-uses the row and reads as thin at a glance — plus a legend under the
table. The border lives on the row's first cell rather than the `<tr>`
itself: a border set directly on a table row does not reliably paint under
`border-collapse: collapse` in every engine. Colour alone must not carry the
meaning: the legend names each band, and each banded row gets an
`aria-label` saying which one it is.

These boundaries are a per-season fact, not a constant -- England's UEFA
coefficient added a fifth Champions League place from 2024/25, and the Europa
and Conference places move when a domestic cup winner has already qualified.
Put the bands for each season pair in one small config object keyed by season,
with the conventional 1-4 / 5 / 6 / 18-20 as the fallback, and say in the
README that the app shows the conventional layout rather than resolving each
season's actual cup-winner permutations.

### 1c. Replay pacing

1x is too fast as first built. Set 1x to roughly 200ms per frame, so a full
season runs about 80-90 seconds -- slow enough to watch positions change and
to see the crossover arrive. The speed multipliers stay 1x to 50x: 50x is
about 4ms per frame, which is exactly the load the rAF buffering above exists
to absorb, and the README's before/after frame-rate numbers are measured there.

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
| 5 | Multi-page shell: routing, sidebar nav, design tokens v2, i18n, page placeholders | — |

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

**Token discipline never costs scope.** It applies to conversation overhead —
narration, restating plans, pasting files back, re-reading what you already
read. It never justifies dropping a feature, skipping a test, weakening error
handling, or shipping something the author cannot explain. If a turn forces a
choice between the two, quality wins and you say so in one line.
