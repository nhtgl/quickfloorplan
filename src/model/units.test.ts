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

  it("formats millimetres as whole centimetres", () => {
    expect(formatLength(4200, "cm")).toBe("420");
    expect(formatLength(0, "cm")).toBe("0");
    expect(formatLength(4204, "cm")).toBe("420");
    expect(formatLengthWithUnit(4200, "cm")).toBe("420 cm");
  });

  it("formats millimetres as metres to 2dp", () => {
    expect(formatLength(4200, "m")).toBe("4.20");
    expect(formatLength(12345, "m")).toBe("12.35");
    expect(formatLengthWithUnit(4200, "m")).toBe("4.20 m");
  });

  it("parses typed values back to integer millimetres", () => {
    expect(parseLength(420, "cm")).toBe(4200);
    expect(parseLength(420.4, "cm")).toBe(4204);
    expect(parseLength(4.2, "m")).toBe(4200);
    expect(parseLength(4.2044, "m")).toBe(4204);
  });

  it("round-trips a whole centimetre", () => {
    expect(formatLength(parseLength(315, "cm"), "cm")).toBe("315");
  });

  it("steps by one centimetre or one centimetre's worth of a metre", () => {
    expect(stepFor("cm")).toBe(1);
    expect(stepFor("m")).toBe(0.01);
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
