/**
 * Geometry is stored as integer millimetres. Millimetres never surface in the UI or the
 * PDF: they exist so that chained wall edits do not accumulate floating-point drift.
 */

export type Unit = "cm" | "m";

/** Tape measurements get written down in centimetres, so that is the default. */
export const DEFAULT_UNIT: Unit = "cm";

const PER_UNIT: Record<Unit, number> = { cm: 10, m: 1000 };

/**
 * How many decimals a unit is shown to.
 *
 * `max` is whatever it takes to state the stored millimetre exactly, so nothing typed is
 * ever thrown away on the way back to the screen: a wall measured at 90.5 cm has to read
 * back as 90.5 cm, or the next edit would commit the rounded 91.
 *
 * `min` keeps the usual case looking like a measurement rather than a bare number —
 * metres read 4.20, not 4.2 — while a stray millimetre still shows as 4.205.
 */
const DECIMALS: Record<Unit, { min: number; max: number }> = {
  cm: { min: 0, max: 1 },
  m: { min: 2, max: 3 },
};

export function formatLength(mm: number, unit: Unit): string {
  const { min, max } = DECIMALS[unit];
  const text = (mm / PER_UNIT[unit]).toFixed(max);
  if (!text.includes(".")) return text;

  const [whole, decimals] = text.split(".");
  const trimmed = decimals.replace(/0+$/, "").padEnd(min, "0");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export function formatLengthWithUnit(mm: number, unit: Unit): string {
  return `${formatLength(mm, unit)} ${unit}`;
}

/** Typed value back to integer millimetres. */
export function parseLength(value: number, unit: Unit): number {
  return Math.round(value * PER_UNIT[unit]);
}

/**
 * How much one press of an input's stepper moves it: one millimetre, whatever the unit.
 *
 * This is also what a number input validates against, so a coarser step would have the
 * browser reject a half-centimetre outright.
 */
export function stepFor(unit: Unit): number {
  return unit === "cm" ? 0.1 : 0.001;
}

export function unitName(unit: Unit): string {
  return unit === "cm" ? "centimetres" : "metres";
}

/**
 * Areas stay in m² whatever the length unit is. A room in square centimetres reads as a
 * six-digit number that means nothing to anyone.
 */
export function formatArea(mm2: number): string {
  return (mm2 / 1_000_000).toFixed(1);
}

export function formatDeg(deg: number): string {
  const rounded = Number(deg.toFixed(1));
  // Avoid rendering "-0.0" for angles that round to zero from below.
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}
