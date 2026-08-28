import { wallEnds, wallLength } from "./geometry";
import { newId } from "./ids";
import { openingSpan } from "./openings";
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
 * Copy an opening from one wall onto a wall lying on top of it.
 *
 * The opening is placed by where it sits in the plan, not by its distance along the
 * other wall, because the two walls may run in opposite directions — which they do
 * whenever two rooms are pushed together, since each room's walls run round its own
 * outline. When they do, the hinge end and the side the leaf swings to both flip, so the
 * copy describes the same physical door rather than a mirror image of it.
 */
export function mapOpeningOntoWall(
  p: Project,
  opening: Opening,
  targetId: WallId,
  sameDirection: boolean,
): Opening {
  const source = axisOf(p, opening.wallId);
  const target = axisOf(p, targetId);
  const centre = pointAt(source, opening.offset);

  const flip = <T extends string>(v: T | undefined, a: T, b: T) =>
    v === undefined ? undefined : v === a ? b : a;

  return {
    ...opening,
    id: newId("o"),
    wallId: targetId,
    offset: Math.round(along(target, centre)),
    hinge: sameDirection ? opening.hinge : flip(opening.hinge, "a", "b"),
    swing: sameDirection ? opening.swing : flip(opening.swing, "in", "out"),
  };
}

function overlapsExisting(p: Project, candidate: Opening): boolean {
  const [start, end] = [
    candidate.offset - candidate.width / 2,
    candidate.offset + candidate.width / 2,
  ];
  return p.openings
    .filter((o) => o.wallId === candidate.wallId)
    .some((o) => {
      const [s, e] = openingSpan(p, o.id);
      return s < end && start < e;
    });
}

export type ShareResult = { project: Project; added: Opening[] };

/**
 * Where a moved run of walls has come to rest on top of another wall, give both walls
 * the openings the other has.
 *
 * A door between two rooms is one door, but this model gives every room its own walls,
 * so it has to appear in both for either room's elevation to be right. Openings that
 * would land only partly on the shared stretch are left alone: half a door is not a
 * door, and guessing at the rest would put a measurement on the page that nobody took.
 */
export function shareOpeningsAcrossTouchingWalls(
  p: Project,
  movedWallIds: WallId[],
): ShareResult {
  const moved = new Set(movedWallIds);
  const stationary = p.walls.filter((w) => !moved.has(w.id));
  let project = p;
  const added: Opening[] = [];

  for (const movedId of movedWallIds) {
    for (const other of stationary) {
      const span = sharedSpan(project, movedId, other.id);
      if (!span) continue;

      const pairs: [WallId, WallId][] = [
        [movedId, other.id],
        [other.id, movedId],
      ];

      for (const [toId, fromId] of pairs) {
        const reach = sharedSpan(project, toId, fromId);
        if (!reach) continue;

        for (const opening of project.openings.filter((o) => o.wallId === fromId)) {
          const candidate = mapOpeningOntoWall(project, opening, toId, reach.sameDirection);
          const [start, end] = [
            candidate.offset - candidate.width / 2,
            candidate.offset + candidate.width / 2,
          ];
          // Only openings that sit wholly on the shared stretch carry across.
          if (start < reach.from - 1 || end > reach.to + 1) continue;
          if (overlapsExisting(project, candidate)) continue;

          project = { ...project, openings: [...project.openings, candidate] };
          added.push(candidate);
        }
      }
    }
  }

  return {
    project: added.length ? { ...project, updatedAt: new Date().toISOString() } : p,
    added,
  };
}
