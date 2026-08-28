/**
 * Geometry is stored as integer millimetres. Millimetres never surface in the UI or the
 * PDF: they exist so that chained wall edits do not accumulate floating-point drift.
 */

export type Unit = "cm" | "m";

/** Tape measurements get written down in centimetres, so that is the default. */
export const DEFAULT_UNIT: Unit = "cm";

const PER_UNIT: Record<Unit, number> = { cm: 10, m: 1000 };

/** Decimals shown: whole centimetres, or metres to the nearest centimetre. */
const DECIMALS: Record<Unit, number> = { cm: 0, m: 2 };

export function formatLength(mm: number, unit: Unit): string {
  return (mm / PER_UNIT[unit]).toFixed(DECIMALS[unit]);
}

export function formatLengthWithUnit(mm: number, unit: Unit): string {
  return `${formatLength(mm, unit)} ${unit}`;
}

/** Typed value back to integer millimetres. */
export function parseLength(value: number, unit: Unit): number {
  return Math.round(value * PER_UNIT[unit]);
}

/** How much one press of an input's stepper moves it. */
export function stepFor(unit: Unit): number {
  return unit === "cm" ? 1 : 0.01;
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
