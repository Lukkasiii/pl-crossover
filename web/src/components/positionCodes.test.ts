import { describe, expect, it } from "vitest";
import { parsePosition } from "./positionCodes";

describe("parsePosition", () => {
  it("reads a multi-letter string as a set of roles, ordered back to front", () => {
    expect(parsePosition("F M S")).toEqual({ roles: ["m", "f"], substitute: true });
    expect(parsePosition("D F M S")).toEqual({ roles: ["d", "m", "f"], substitute: true });
  });

  it("treats a lone S as substitute appearances with no starting role", () => {
    expect(parsePosition("S")).toEqual({ roles: [], substitute: true });
  });

  it("keeps GK as one role, not two letters", () => {
    expect(parsePosition("GK")).toEqual({ roles: ["gk"], substitute: false });
    expect(parsePosition("GK S")).toEqual({ roles: ["gk"], substitute: true });
  });
});
