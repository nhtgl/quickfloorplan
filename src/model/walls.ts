import type { EndAdjust, Wall, WallOffsets } from "./types";

/** A wall whose faces sit the same distance either side of its centreline. */
export function evenOffsets(thickness: number): WallOffsets {
  return { left: thickness / 2, right: thickness / 2 };
}

/**
 * The face on one side of a wall. `side` is +1 for the left of the wall's own direction,
 * -1 for the right.
 */
export function offsetForSide(wall: Wall, side: number): number {
  return side >= 0 ? wall.offsets.left : wall.offsets.right;
}

export function wallThickness(wall: Wall): number {
  return wall.offsets.left + wall.offsets.right;
}

/**
 * How far the middle of the wall band sits from the centreline. Zero for a wall with
 * even faces; otherwise the band is drawn off to one side.
 */
export function bandShift(wall: Wall): number {
  return (wall.offsets.left - wall.offsets.right) / 2;
}

export const SQUARE_ENDS: { a: EndAdjust; b: EndAdjust } = {
  a: { left: 0, right: 0 },
  b: { left: 0, right: 0 },
};

export function wallEndAdjust(wall: Wall): { a: EndAdjust; b: EndAdjust } {
  return wall.ends ?? SQUARE_ENDS;
}

/** How far one face is pushed at one end, beyond where the mitre would put it. */
export function endAdjustForSide(wall: Wall, end: "a" | "b", side: number): number {
  const adjust = wallEndAdjust(wall)[end];
  return side >= 0 ? adjust.left : adjust.right;
}

/** True when either end has been slanted away from square. */
export function hasSlantedEnds(wall: Wall): boolean {
  const e = wallEndAdjust(wall);
  return [e.a.left, e.a.right, e.b.left, e.b.right].some((v) => v !== 0);
}
