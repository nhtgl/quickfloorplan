import { loopSignedArea, pointAlongWall, wallById, wallEnds } from "./geometry";
import { coincidentWalls } from "./sharedOpenings";
import { roomsInLoop } from "./loops";
import { wallSpanForSide } from "./measure";
import type { Point, Project, Room, WallId } from "./types";
import { offsetForSide } from "./walls";

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
  const off = side * offsetForSide(wallById(p, id), side);

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

/**
 * What lies on each side of a wall, for naming its two faces.
 *
 * "Left" and "right" mean nothing to someone holding a tape, but "the kitchen side" does.
 * A side with no room against it is outside the plan as drawn.
 */
export function roomsOnSide(p: Project, id: WallId, side: number): Room[] {
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  return p.rooms
    .filter((room) => {
      if (room.polygon.length < 3) return false;
      const c = room.polygon.reduce(
        (acc, pt) => ({
          x: acc.x + pt.x / room.polygon.length,
          y: acc.y + pt.y / room.polygon.length,
        }),
        { x: 0, y: 0 },
      );
      // Only rooms actually against this wall, not every room in the plan.
      if (Math.hypot(c.x - mid.x, c.y - mid.y) > 20_000) return false;
      const which = (c.x - mid.x) * nx + (c.y - mid.y) * ny;
      return side >= 0 ? which >= 0 : which < 0;
    });
}

/**
 * Whether a face is worth dimensioning.
 *
 * A wall dimensions the rooms of its own run, and nobody else's. Two rooms pushed
 * together have a wall each on the same line, and both can see a room on either side of
 * them; without this each face would be dimensioned twice over, stacking four strings
 * into the gap between the rooms where two of them repeat the other two.
 *
 * A face with no room against it is dimensioned only when it is the outside of the
 * building, which is worth stating once.
 */
export function faceIsWorthDimensioning(p: Project, id: WallId, side: number): boolean {
  const rooms = roomsOnSide(p, id, side);
  if (rooms.length > 0) {
    const mine = new Set(roomsInLoop(p, id));
    return rooms.some((r) => mine.has(r.id));
  }
  return coincidentWalls(p, id).length === 0;
}

export function wallSideNames(p: Project, id: WallId): { left: string; right: string } {
  const names = {
    left: roomsOnSide(p, id, 1).map((r) => r.name),
    right: roomsOnSide(p, id, -1).map((r) => r.name),
  };

  // With no room against a side, say which way it faces. A wall in a closed run has an
  // inside and an outside; a loose one only has a left and a right. The two must differ,
  // or the panel would offer two fields with the same name.
  const area = loopSignedArea(p, id);
  const fallback =
    area === null || area === 0
      ? { left: "Left", right: "Right" }
      : area > 0
        ? { left: "Inside", right: "Outside" }
        : { left: "Outside", right: "Inside" };

  return {
    left: names.left[0] ?? fallback.left,
    right: names.right[0] ?? fallback.right,
  };
}

/**
 * The outline a wall occupies: its two faces joined end to end.
 *
 * A wall is drawn from this rather than as a thick line, because neither an off-centre
 * pair of faces nor a slanted end can be expressed by stroking a centreline.
 */
export function wallPolygon(p: Project, id: WallId): Point[] {
  const left = wallLinePoints(p, id, "left");
  const right = wallLinePoints(p, id, "right");
  return [left.from, left.to, right.to, right.from];
}

/** The two face points directly across the wall from a distance along its centreline. */
export function wallCrossSection(
  p: Project,
  id: WallId,
  distance: number,
): { left: Point; right: Point } {
  const wall = wallById(p, id);
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const on = pointAlongWall(p, id, distance);
  return {
    left: { x: on.x + nx * wall.offsets.left, y: on.y + ny * wall.offsets.left },
    right: { x: on.x - nx * wall.offsets.right, y: on.y - ny * wall.offsets.right },
  };
}

/** A point on one face of a wall, a measured distance along the wall's own axis. */
export function facePointAt(
  p: Project,
  id: WallId,
  side: number,
  distance: number,
): Point {
  const wall = wallById(p, id);
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const off = side * offsetForSide(wall, side);
  const on = pointAlongWall(p, id, distance);
  return { x: on.x + nx * off, y: on.y + ny * off };
}
