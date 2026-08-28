import { chainFrom, nodeById, wallById } from "./geometry";
import { pointInPolygon, pointOnBoundary } from "./rooms";
import type { Point, Project, RoomId, WallId } from "./types";

/** Every wall in the run this one belongs to, starting with it. */
export function loopWallIds(p: Project, wallId: WallId): WallId[] {
  return [wallId, ...chainFrom(p, wallId)];
}

/** Every corner in that run, without repeats. */
export function loopNodeIds(p: Project, wallId: WallId): string[] {
  const ids = new Set<string>();
  for (const id of loopWallIds(p, wallId)) {
    const w = wallById(p, id);
    ids.add(w.a);
    ids.add(w.b);
  }
  return [...ids];
}

export function loopPolygon(p: Project, wallId: WallId): Point[] {
  return loopWallIds(p, wallId).map((id) => {
    const n = nodeById(p, wallById(p, id).a);
    return { x: n.x, y: n.y };
  });
}

/**
 * Rooms that belong to a run of walls, by majority of their corners sitting inside it.
 *
 * A corner exactly on the run counts as inside. When a project measures centrelines the
 * room outline lands precisely on the walls, so a strict inside test would claim nothing
 * at all and rooms would be left behind whenever their walls moved.
 *
 * Majority rather than all, because a room drawn freehand need not line up with any wall.
 */
export function roomsInLoop(p: Project, wallId: WallId): RoomId[] {
  const poly = loopPolygon(p, wallId);
  if (poly.length < 3) return [];
  return p.rooms
    .filter((room) => {
      if (room.polygon.length === 0) return false;
      const inside = room.polygon.filter(
        (pt) => pointInPolygon(pt, poly) || pointOnBoundary(pt, poly, 1),
      ).length;
      return inside * 2 > room.polygon.length;
    })
    .map((r) => r.id);
}

/**
 * Shift a whole run of walls, and the rooms inside it, by the same amount. Anything
 * outside the run stays where it is, which is what makes one room movable against
 * another.
 */
export function moveLoop(p: Project, wallId: WallId, dx: number, dy: number): Project {
  if (dx === 0 && dy === 0) return p;
  const nodes = new Set(loopNodeIds(p, wallId));
  const rooms = new Set(roomsInLoop(p, wallId));
  const shift = (pt: Point): Point => ({
    x: Math.round(pt.x + dx),
    y: Math.round(pt.y + dy),
  });

  return {
    ...p,
    nodes: p.nodes.map((n) => (nodes.has(n.id) ? { ...n, ...shift(n) } : n)),
    rooms: p.rooms.map((r) =>
      rooms.has(r.id) ? { ...r, polygon: r.polygon.map(shift) } : r,
    ),
    updatedAt: new Date().toISOString(),
  };
}
