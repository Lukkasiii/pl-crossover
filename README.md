# PL Crossover

When does *this* season start telling you more than *last* season did?

Every August, pundits and models lean on last year's table. At some point in the
autumn that stops being the best available information — the new season has said
enough. This project finds that point, to the game, and lets you watch it happen.

It grew out of a graduate sports-analytics study that measured the same thing at
four checkpoints (games 5, 10, 15 and 20) in a spreadsheet. This is that analysis
rebuilt on match-level data, at every one of the 38 games, as a web application.

---

## Status

| | |
|---|---|
| Data pipeline | built, tested |
| Model engine | built, tested, reproduces the original study |
| REST + WebSocket API | next |
| React frontend | next |
| Auth + saved scenarios | next |

---

## Getting the data

```bash
python3 scripts/fetch_understat.py            # seasons 2016..2024
python3 scripts/build_db.py                   # -> data/pl.db
```

Nine seasons, one request each, ~1.5s apart. Standard library only — nothing to
install. Each season is checked for the 380 matches / 20 teams / 38 games each
that a complete Premier League season must have, and anything short is reported
rather than silently accepted.

Understat has no documented API. It used to render the fixture list into the
league page as a hex-escaped JSON blob assigned to `var datesData`; that is what
most scrapers in the wild still look for, and it is gone. The page now ships
nearly empty and the frontend calls an endpoint:

```
GET https://understat.com/getLeagueData/EPL/<year>
X-Requested-With: XMLHttpRequest
```

That header is the whole guard — without it the endpoint returns a 404 HTML
page, which is why the site works in a browser and a plain `curl` does not.
The response carries `dates` (380 fixtures, the same shape the embedded blob
had), `teams` (per-team 38-match history with npxG, xpts, ppda, deep) and
`players`. The full payload is saved per season; re-fetching later to recover a
field that was thrown away is worse than the disk space.

The old HTML scrape is kept as a fallback, so if the endpoint moves the fetcher
degrades instead of failing.

## Troubleshooting

**`CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate`** — the
python.org build of Python on macOS ships without a certificate bundle and does
not use the system keychain. Run the installer's own script once, and let it
finish before running anything else:

```bash
/Applications/Python\ 3.12/Install\ Certificates.command
```

Match the version to whatever `ls -d /Applications/Python*/` prints.

**`no datesData blob found` / a 404 from the endpoint** — Understat changed
something. `scripts/diagnose_fetch.py` fetches one season, saves the raw
response to `data/raw/_debug_page.html`, and reports which extraction patterns
still match. `scripts/diagnose_tls.py` separates a TLS problem from a network
one by dumping the certificate each host presents and retrying through several
trust stores.

## Indexing by games played, not matchweek

Premier League matchweeks are not aligned in practice. Games get postponed and
replayed weeks later, so on any given Saturday teams have played different
numbers of matches — and in 2019/20 the whole season stopped for three months.

The question here is "after a team has played N games, how much do we know about
it", so the index is that team's own game count, ordered by kickoff time. Every
season then behaves the same way, and `team_state` holds one row per team per
game played: the league table exactly as it stood for that team at that moment.
That table is what the dashboard streams.

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
presentation.

```
predictor               RMSE    deck      R2    deck   LOSO RMSE   status
------------------------------------------------------------------------------
Prior xG (full)        4.087    4.09   0.443   0.443       4.140   ok
xG @5                  4.505    4.50   0.323   0.323       4.523   ok
xG @10                 4.172    4.17   0.419   0.419       4.211   ok
xG @15                 3.869    3.87   0.501   0.501       3.921   ok
xG @20                 3.635    3.63   0.559   0.559       3.700   ok
Prior xGD (full)       3.764    3.76   0.528   0.528       3.789   ok
xGD @5                 4.486    4.49   0.329   0.329       4.513   ok
xGD @10                3.960    3.96   0.477   0.477       3.983   ok
xGD @15                3.585    3.58   0.571   0.571       3.602   ok
xGD @20                3.303    3.30   0.636   0.636       3.326   ok
------------------------------------------------------------------------------
All 10 published figures reproduced.
```

Held-out error is only 0.02–0.07 positions worse than in-sample throughout, so
the original conclusions are not an artefact of fitting and scoring on the same
136 rows.

## Tests

```bash
python3 -m pytest api/tests -q
```

The suite generates two complete synthetic seasons, runs the real ETL over them
and checks the output holds together: points equal 3W + D, W + D + L equals games
played, goal difference equals for minus against, cumulative totals never
decrease, ranks form an exact 1..20 permutation in every slice, and league-wide
goals scored equal goals conceded. Fixtures are written to a temp directory, so a
test run can never be mistaken for real Understat output.

## Layout

```
scripts/
  fetch_understat.py        match-level xG, standard library only
  build_db.py               ETL -> SQLite
  validate_checkpoints.py   regression test against the original study
api/
  app/model.py              OLS, leave-one-season-out, Bayesian blend, crossover
  tests/test_pipeline.py
data/
  excel/                    the original coursework workbooks
  raw/                      fetched match data (gitignored)
  pl.db                     built database (gitignored)
```

## Sources

Match-level xG from [Understat](https://understat.com). The original study also
used [FBref](https://fbref.com) for goal difference and final standings; those
are now derived from the match data directly.
