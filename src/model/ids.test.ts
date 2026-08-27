import { describe, it, expect } from "vitest";
import { newId, nextWallLabel } from "./ids";

const alphabet = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

describe("newId", () => {
  it("prefixes and does not collide across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("w")));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^w_/);
  });
});

describe("nextWallLabel", () => {
  it("starts at A", () => {
    expect(nextWallLabel([])).toBe("A");
  });

  it("takes the next free letter", () => {
    expect(nextWallLabel(["A", "B"])).toBe("C");
  });

  it("fills a gap left by a deleted wall", () => {
    expect(nextWallLabel(["A", "C"])).toBe("B");
  });

  it("rolls over to two letters after Z", () => {
    expect(nextWallLabel(alphabet)).toBe("AA");
    expect(nextWallLabel([...alphabet, "AA"])).toBe("AB");
  });
});
