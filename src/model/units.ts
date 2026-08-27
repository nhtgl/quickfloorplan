/** Geometry is stored as integer millimetres; the UI never shows millimetres. */

export function mmToM(mm: number): string {
  return (mm / 1000).toFixed(2);
}

export function mToMm(m: number): number {
  return Math.round(m * 1000);
}

export function mm2ToM2(mm2: number): string {
  return (mm2 / 1_000_000).toFixed(1);
}

export function formatDeg(deg: number): string {
  const rounded = Number(deg.toFixed(1));
  // Avoid rendering "-0.0" for angles that round to zero from below.
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}
