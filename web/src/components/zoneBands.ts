export interface ZoneBand {
  key: string;
  label: string;
  from: number;
  to: number;
  color: string;
}

const CONVENTIONAL_BANDS: ZoneBand[] = [
  { key: "cl", label: "Champions League", from: 1, to: 4, color: "#1d4ed8" },
  { key: "el", label: "Europa League", from: 5, to: 5, color: "#f97316" },
  { key: "ecl", label: "Conference League", from: 6, to: 6, color: "#16a34a" },
  { key: "rel", label: "Relegation", from: 18, to: 20, color: "#dc2626" },
];

/**
 * England's UEFA coefficient added a 5th Champions League place from
 * 2024/25, shifting Europa/Conference down a place. The Europa and
 * Conference slots also move when a domestic cup winner has already
 * qualified via the league -- this app shows the conventional layout
 * rather than resolving each season's actual cup-winner permutations
 * (see README).
 */
const SEASON_OVERRIDES: Record<string, ZoneBand[]> = {
  "2024/25": [
    { key: "cl", label: "Champions League", from: 1, to: 5, color: "#1d4ed8" },
    { key: "el", label: "Europa League", from: 6, to: 6, color: "#f97316" },
    { key: "ecl", label: "Conference League", from: 7, to: 7, color: "#16a34a" },
    { key: "rel", label: "Relegation", from: 18, to: 20, color: "#dc2626" },
  ],
};

export function bandsForSeason(currentSeasonLabel: string): ZoneBand[] {
  return SEASON_OVERRIDES[currentSeasonLabel] ?? CONVENTIONAL_BANDS;
}

export function bandForRank(bands: ZoneBand[], rank: number | null): ZoneBand | null {
  if (rank === null) return null;
  return bands.find((b) => rank >= b.from && rank <= b.to) ?? null;
}
