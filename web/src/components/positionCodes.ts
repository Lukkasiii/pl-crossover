/**
 * Understat's `position` field is a set of letters, not one position:
 * each letter is a role the player appeared in that season, and `S` means
 * they came on as a substitute at least once. Understat publishes no
 * glossary, so this reading is derived from the data (see the ⓘ on the
 * Key players table and CLAUDE.md) -- players whose string is just `S`
 * average 9.6 minutes per appearance; strings without `S` average 88.4.
 */
export type PositionRole = "gk" | "d" | "m" | "f";

const ROLE_BY_LETTER: Record<string, PositionRole> = { GK: "gk", D: "d", M: "m", F: "f" };
// Back to front, the order a team sheet reads in -- Understat's own
// strings are alphabetical ("F M S"), which puts forwards before midfielders.
const ROLE_ORDER: PositionRole[] = ["gk", "d", "m", "f"];

export interface ParsedPosition {
  roles: PositionRole[];
  substitute: boolean;
}

// Most advanced first: when a player-season lists several positions, the
// one shown is the furthest forward. A stated convention (the column's ⓘ
// says so), not something the data decides.
const DISPLAY_PRECEDENCE: PositionRole[] = ["f", "m", "d", "gk"];

/**
 * The one position the Key players table shows, or null when Understat
 * records none -- a string of just `S`. Null is shown as an em-dash, never
 * filled from another season: that would be inference presented as fact.
 */
export function primaryRole(code: string): PositionRole | null {
  const { roles } = parsePosition(code);
  return DISPLAY_PRECEDENCE.find((r) => roles.includes(r)) ?? null;
}

export function parsePosition(code: string): ParsedPosition {
  const letters = code.trim().split(/\s+/).filter(Boolean);
  const roles = new Set<PositionRole>();
  let substitute = false;
  for (const letter of letters) {
    if (letter === "S") substitute = true;
    else if (ROLE_BY_LETTER[letter]) roles.add(ROLE_BY_LETTER[letter]);
  }
  return { roles: ROLE_ORDER.filter((r) => roles.has(r)), substitute };
}
