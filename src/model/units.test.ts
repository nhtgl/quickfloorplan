import { describe, it, expect } from "vitest";
import { mmToM, mToMm, mm2ToM2, formatDeg } from "./units";

describe("units", () => {
  it("formats mm as metres to 2dp", () => {
    expect(mmToM(4200)).toBe("4.20");
    expect(mmToM(0)).toBe("0.00");
    expect(mmToM(12345)).toBe("12.35");
  });

  it("parses metres to integer mm", () => {
    expect(mToMm(4.2)).toBe(4200);
    expect(mToMm(4.2044)).toBe(4204);
    expect(mToMm(0)).toBe(0);
  });

  it("formats mm2 as m2 to 1dp", () => {
    expect(mm2ToM2(13_020_000)).toBe("13.0");
    expect(mm2ToM2(11_800_000)).toBe("11.8");
  });

  it("formats degrees to 1dp", () => {
    expect(formatDeg(90)).toBe("90.0");
    expect(formatDeg(90.04)).toBe("90.0");
    expect(formatDeg(-0.001)).toBe("0.0");
  });
});
