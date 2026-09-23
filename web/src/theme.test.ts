import { describe, expect, it } from "vitest";
import { getColors, getFonts } from "./theme";

function fakeRoot(map: Record<string, string>) {
  return { getPropertyValue: (name: string) => map[name] ?? "" };
}

describe("theme token resolution", () => {
  it("reads every colour token from the given root instead of a value frozen at import time", () => {
    const colors = getColors(fakeRoot({ "--bg": "#1A0A22", "--panel": "#241030", "--green": "#00FF85" }));
    expect(colors.bg).toBe("#1A0A22");
    expect(colors.panel).toBe("#241030");
    expect(colors.green).toBe("#00FF85");
  });

  it("trims whitespace the way getComputedStyle returns custom properties", () => {
    expect(getColors(fakeRoot({ "--red": "  #E90052  " })).red).toBe("#E90052");
  });

  it("never silently returns an empty token when the root has a value", () => {
    const colors = getColors(fakeRoot({ "--bg": "#1A0A22" }));
    expect(colors.bg).not.toBe("");
  });

  it("reads font tokens the same way", () => {
    const fonts = getFonts(fakeRoot({ "--font-mono": "IBM Plex Mono" }));
    expect(fonts.mono).toBe("IBM Plex Mono");
  });
});
