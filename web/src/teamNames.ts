/**
 * Understat/DB names are full club names; broadcasts use shorter forms.
 * Only the handful that actually differ need an entry -- everything else
 * falls back to the name as stored.
 */
const BROADCAST_NAMES: Record<string, string> = {
  "Manchester City": "Man City",
  "Manchester United": "Man United",
  "Wolverhampton Wanderers": "Wolves",
  "Newcastle United": "Newcastle",
};

export function broadcastName(name: string): string {
  return BROADCAST_NAMES[name] ?? name;
}

/** /teams/:slug is not built yet (see CLAUDE.md v2 routes) -- this just has to be a stable, URL-safe key. */
export function teamSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
