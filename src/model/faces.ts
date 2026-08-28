import { pointAlongWall, wallById, wallEnds } from "./geometry";
import { wallSpanForSide } from "./measure";
import type { Point, Project, WallId } from "./types";

/** Which of a wall's three lines a point sits on. */
export type WallLine = "left" | "centre" | "right";

/**
 * A wall has three lines running along it: a face on each side and the centreline
 * between them. Only the centreline is stored — the faces are half a thickness either
 * side of it, trimmed at each corner where they meet the neighbouring wall's face.
 *
 * The faces are what anyone actually measures, and two rooms sharing a wall measure
 * different ones, so they have to be reachable when drawing and not just implied by the
 * thickness of a stroke.
 */
export function wallLinePoints(
  p: Project,
  id: WallId,
  line: WallLine,
): { from: Point; to: Point } {
  const side = line === "left" ? 1 : line === "right" ? -1 : 0;
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Left-hand normal of the wall's own direction.
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const off = (side * wallById(p, id).thickness) / 2;

  const span = wallSpanForSide(p, id, side);
  const at = (d: number): Point => {
    const on = pointAlongWall(p, id, d);
    return { x: Math.round(on.x + nx * off), y: Math.round(on.y + ny * off) };
  };
  return { from: at(span.start), to: at(span.end) };
}

export type FaceCorner = { point: Point; wallId: WallId; line: WallLine };

/** Both ends of both faces of a wall: the four corners of the band it occupies. */
export function wallFaceCorners(p: Project, id: WallId): FaceCorner[] {
  return (["left", "right"] as const).flatMap((line) => {
    const { from, to } = wallLinePoints(p, id, line);
    return [
      { point: from, wallId: id, line },
      { point: to, wallId: id, line },
    ];
  });
}

/** Every face corner in the project, for snapping a new wall onto an existing one. */
export function allFaceCorners(p: Project): FaceCorner[] {
  return p.walls.flatMap((w) => wallFaceCorners(p, w.id));
}
