import { wallEnds, wallLength } from "./geometry";
import type { Opening, Point, Project, WallId } from "./types";

/** How far apart two centrelines may sit and still count as the same wall, in mm. */
export const TOUCH_TOLERANCE_MM = 20;

type Axis = { origin: Point; ux: number; uy: number; length: number };

function axisOf(p: Project, id: WallId): Axis {
  const { a, b } = wallEnds(p, id);
  const length = wallLength(p, id) || 1;
  return { origin: { x: a.x, y: a.y }, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length, length };
}

const along = (ax: Axis, pt: Point) =>
  (pt.x - ax.origin.x) * ax.ux + (pt.y - ax.origin.y) * ax.uy;

const across = (ax: Axis, pt: Point) =>
  (pt.x - ax.origin.x) * ax.uy - (pt.y - ax.origin.y) * ax.ux;

const pointAt = (ax: Axis, d: number): Point => ({
  x: ax.origin.x + ax.ux * d,
  y: ax.origin.y + ax.uy * d,
});

/**
 * The stretch of `target` that `other` lies on top of, or null if they are not the same
 * piece of wall. Two walls count as the same when their centrelines are collinear within
 * a tolerance and their extents overlap — which is what snapping one room against
 * another produces.
 */
export function sharedSpan(
  p: Project,
  targetId: WallId,
  otherId: WallId,
): { from: number; to: number; sameDirection: boolean } | null {
  const target = axisOf(p, targetId);
  const other = axisOf(p, otherId);

  // Parallel, and running along the same line rather than merely alongside it.
  const cross = target.ux * other.uy - target.uy * other.ux;
  if (Math.abs(cross) > 0.01) return null;

  const ends = wallEnds(p, otherId);
  if (
    Math.abs(across(target, ends.a)) > TOUCH_TOLERANCE_MM ||
    Math.abs(across(target, ends.b)) > TOUCH_TOLERANCE_MM
  ) {
    return null;
  }

  const t0 = along(target, ends.a);
  const t1 = along(target, ends.b);
  const from = Math.max(0, Math.min(t0, t1));
  const to = Math.min(target.length, Math.max(t0, t1));
  if (to - from <= 0) return null;

  return { from, to, sameDirection: target.ux * other.ux + target.uy * other.uy > 0 };
}

/**
 * Walls lying on top of this one. Two rooms pushed together each keep their own walls,
 * so the wall between them is described twice, once from each side.
 */
export function coincidentWalls(p: Project, wallId: WallId): WallId[] {
  return p.walls
    .filter((w) => w.id !== wallId && sharedSpan(p, wallId, w.id) !== null)
    .map((w) => w.id);
}

/**
 * An opening as it appears on a particular wall.
 *
 * There is only ever one door. When two rooms share a wall, both rooms' walls show that
 * same door rather than each holding a copy, so moving or resizing it from either room
 * changes the one door and the two can never drift apart.
 *
 * `offset`, `hinge` and `swing` describe the door as seen from this wall. Adjacent
 * rooms' walls run in opposite directions, because each room's walls run round its own
 * outline, so the numbers differ between the two views while the door they describe does
 * not move: the hinge stays on the same jamb and the leaf swings into the same room.
 */
export type OpeningView = {
  opening: Opening;
  /** False when the opening belongs to a wall lying on top of this one. */
  own: boolean;
  /** mm along this wall, from its a end, to the opening's centre */
  offset: number;
  hinge?: "a" | "b";
  swing?: "in" | "out";
};

function viewOnWall(p: Project, opening: Opening, wallId: WallId): OpeningView | null {
  if (opening.wallId === wallId) {
    return {
      opening,
      own: true,
      offset: opening.offset,
      hinge: opening.hinge,
      swing: opening.swing,
    };
  }

  const reach = sharedSpan(p, wallId, opening.wallId);
  if (!reach) return null;

  const source = axisOf(p, opening.wallId);
  const target = axisOf(p, wallId);
  const centre = pointAt(source, opening.offset);
  const offset = Math.round(along(target, centre));

  // Only openings sitting wholly on the shared stretch belong to both walls. Half a door
  // is not a door, and drawing the rest of it would put a measurement on the page that
  // nobody took.
  if (offset - opening.width / 2 < reach.from - 1) return null;
  if (offset + opening.width / 2 > reach.to + 1) return null;

  const flip = <T extends string>(v: T | undefined, a: T, b: T) =>
    v === undefined ? undefined : v === a ? b : a;

  return {
    opening,
    own: false,
    offset,
    hinge: reach.sameDirection ? opening.hinge : flip(opening.hinge, "a", "b"),
    swing: reach.sameDirection ? opening.swing : flip(opening.swing, "in", "out"),
  };
}

/**
 * Every opening that appears on a wall: its own, and any belonging to a wall lying on
 * top of it. Ordered along the wall, which is the order a setting-out chain reads in.
 */
export function wallOpeningViews(p: Project, wallId: WallId): OpeningView[] {
  const shared = new Set(coincidentWalls(p, wallId));
  return p.openings
    .filter((o) => o.wallId === wallId || shared.has(o.wallId))
    .map((o) => viewOnWall(p, o, wallId))
    .filter((v): v is OpeningView => v !== null)
    .sort((a, b) => a.offset - b.offset);
}

/** The span an opening view covers along its wall, as [start, end] in mm. */
export function viewSpan(view: OpeningView): [number, number] {
  return [view.offset - view.opening.width / 2, view.offset + view.opening.width / 2];
}
