import { describe, it, expect } from "vitest";
import {
  DEFAULT_UNIT,
  formatArea,
  formatDeg,
  formatLength,
  formatLengthWithUnit,
  parseLength,
  stepFor,
  unitName,
} from "./units";

describe("units", () => {
  it("defaults to centimetres", () => {
    expect(DEFAULT_UNIT).toBe("cm");
  });

  it("formats whole centimetres without a pointless decimal", () => {
    expect(formatLength(4200, "cm")).toBe("420");
    expect(formatLength(0, "cm")).toBe("0");
    expect(formatLengthWithUnit(4200, "cm")).toBe("420 cm");
  });

  it("keeps a half centimetre rather than rounding it away", () => {
    expect(formatLength(905, "cm")).toBe("90.5");
    expect(formatLength(4204, "cm")).toBe("420.4");
    expect(formatLengthWithUnit(905, "cm")).toBe("90.5 cm");
  });

  it("formats metres to 2dp, as a measurement is usually written", () => {
    expect(formatLength(4200, "m")).toBe("4.20");
    expect(formatLength(12350, "m")).toBe("12.35");
    expect(formatLengthWithUnit(4200, "m")).toBe("4.20 m");
  });

  it("shows a stray millimetre in metres rather than losing it", () => {
    expect(formatLength(4205, "m")).toBe("4.205");
    expect(formatLength(12345, "m")).toBe("12.345");
  });

  it("parses typed values back to integer millimetres", () => {
    expect(parseLength(420, "cm")).toBe(4200);
    expect(parseLength(420.4, "cm")).toBe(4204);
    expect(parseLength(4.2, "m")).toBe(4200);
    expect(parseLength(4.2044, "m")).toBe(4204);
  });

  it("round-trips whatever was typed, so a second edit does not shift it", () => {
    for (const [typed, unit] of [
      [315, "cm"],
      [90.5, "cm"],
      [420.4, "cm"],
      [4.2, "m"],
      [4.205, "m"],
    ] as const) {
      const stored = parseLength(typed, unit);
      // Reading the field back and committing it again must land on the same millimetre.
      expect(parseLength(Number(formatLength(stored, unit)), unit)).toBe(stored);
    }
  });

  it("steps by a millimetre, so a number input accepts one", () => {
    expect(stepFor("cm")).toBe(0.1);
    expect(stepFor("m")).toBe(0.001);
  });

  it("keeps areas in square metres whatever the length unit", () => {
    expect(formatArea(13_020_000)).toBe("13.0");
    expect(formatArea(11_800_000)).toBe("11.8");
  });

  it("names units for the PDF footer", () => {
    expect(unitName("cm")).toBe("centimetres");
    expect(unitName("m")).toBe("metres");
  });

  it("formats degrees to 1dp without a negative zero", () => {
    expect(formatDeg(90)).toBe("90.0");
    expect(formatDeg(-0.001)).toBe("0.0");
  });
});
