import { describe, expect, it } from "vitest";
import { bandForRank, bandsForSeason } from "./zoneBands";

describe("bandsForSeason", () => {
  it("falls back to the conventional 1-4/5/6/18-20 layout by default", () => {
    const bands = bandsForSeason("2016/17");
    expect(bands.map((b) => [b.key, b.from, b.to])).toEqual([
      ["cl", 1, 4],
      ["el", 5, 5],
      ["ecl", 6, 6],
      ["rel", 18, 20],
    ]);
  });

  it("shifts down a place for 2024/25's 5th Champions League spot", () => {
    const bands = bandsForSeason("2024/25");
    expect(bands.map((b) => [b.key, b.from, b.to])).toEqual([
      ["cl", 1, 5],
      ["el", 6, 6],
      ["ecl", 7, 7],
      ["rel", 18, 20],
    ]);
  });
});

describe("bandForRank", () => {
  const bands = bandsForSeason("2016/17");

  it("finds the band a rank falls in", () => {
    expect(bandForRank(bands, 1)?.key).toBe("cl");
    expect(bandForRank(bands, 4)?.key).toBe("cl");
    expect(bandForRank(bands, 5)?.key).toBe("el");
    expect(bandForRank(bands, 20)?.key).toBe("rel");
  });

  it("returns null for a rank outside every band", () => {
    expect(bandForRank(bands, 10)).toBeNull();
  });

  it("returns null for a team that hasn't played yet (no rank)", () => {
    expect(bandForRank(bands, null)).toBeNull();
  });
});
