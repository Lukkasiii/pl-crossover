#!/usr/bin/env node
// Pre-renders a real dist/<route>/index.html for each of the eight known
// static routes (see CLAUDE.md "v2 -- multi-page dashboard / Routes"),
// baking route-specific <title>/description/OG/Twitter tags into the
// static HTML shell before any JS runs.
//
// Without this, GitHub Pages has no file at e.g. /pl-crossover/season: a
// direct hit or a link unfurler (which never executes JS) only ever sees
// dist/404.html's generic content under a 404 status. The page still
// renders correctly for a human once the SPA boots and the router reads
// window.location -- but a crawler or a Slack/LinkedIn preview believes the
// status line and the untouched <title>, not the pixels. Each of these
// files is the same JS bundle (asset paths are absolute under base
// "/pl-crossover/", so nesting them a directory deeper changes nothing) with
// only the <head> metadata swapped, which is enough for a crawler that
// never runs the bundle to see the right title either way.
//
// The dynamic /teams/:slug route is deliberately not covered here -- there
// is no fixed list of slugs to enumerate at build time, so it keeps relying
// on the 404.html fallback (see CLAUDE.md "Deep links need a
// static-hosting fallback").
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SITE_URL = "https://lukkasiii.github.io/pl-crossover";

const ROUTES = [
  {
    path: "overview",
    title: "Overview — PL Crossover",
    description:
      "The answer in one screen: 11.8 games into a Premier League season, this season's xG starts predicting the final table better than last season's table does.",
  },
  {
    path: "season",
    title: "Season Replay — PL Crossover",
    description:
      "Replay a Premier League season match by match, 380 games, while the RMSE curve and the Bayesian prior/data blend update alongside it.",
  },
  {
    path: "model",
    title: "The model — PL Crossover",
    description:
      "The Bayesian blend behind the replay, explained: drag the prior weight and watch which of xG, xGD, goal difference and points becomes reliable earliest.",
  },
  {
    path: "teams",
    title: "Teams — PL Crossover",
    description: "Every team that has played across the nine sampled Premier League seasons, one list.",
  },
  {
    path: "compare",
    title: "Compare — PL Crossover",
    description: "Two teams, or two season pairs, side by side.",
  },
  {
    path: "method",
    title: "Method — PL Crossover",
    description:
      "Pooled regression, per-season regression, and the rank-based method the original study tried and this app never ships.",
  },
  {
    path: "scenarios",
    title: "Saved Scenarios — PL Crossover",
    description: "Name and save a set of model parameters, then load and compare them again later.",
  },
];

function replaceTitle(html, title) {
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error("prerender-routes: no <title> tag in the template");
  return html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
}

// Matches the whole <meta ...> element containing the given attribute (e.g.
// `property="og:title"`), then swaps just its content="..." value -- meta
// tags in this template span multiple lines, but `[^>]` already matches
// newlines, so no extra flags are needed to cross them.
function replaceMetaContent(html, identifyingAttr, content) {
  const re = new RegExp(`<meta[^>]*${identifyingAttr}[^>]*>`);
  const match = html.match(re);
  if (!match) throw new Error(`prerender-routes: no <meta> tag matching ${identifyingAttr}`);
  const escaped = content.replace(/"/g, "&quot;");
  const newTag = match[0].replace(/content="[^"]*"/, `content="${escaped}"`);
  return html.slice(0, match.index) + newTag + html.slice(match.index + match[0].length);
}

async function main() {
  const template = await readFile(path.join(DIST, "index.html"), "utf8");

  for (const route of ROUTES) {
    let html = template;
    html = replaceTitle(html, route.title);
    html = replaceMetaContent(html, 'name="description"', route.description);
    html = replaceMetaContent(html, 'property="og:url"', `${SITE_URL}/${route.path}`);
    html = replaceMetaContent(html, 'property="og:title"', route.title);
    html = replaceMetaContent(html, 'property="og:description"', route.description);
    html = replaceMetaContent(html, 'name="twitter:title"', route.title);
    html = replaceMetaContent(html, 'name="twitter:description"', route.description);

    const dir = path.join(DIST, route.path);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html);
  }
}

main();
