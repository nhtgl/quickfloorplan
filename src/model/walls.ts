import type { Wall, WallOffsets } from "./types";

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
