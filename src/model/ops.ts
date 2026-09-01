import { addNode, addWall } from "./factory";
import { mergeOpenNode, wallEnds, wallLength } from "./geometry";
import { wallLengthForSide } from "./measure";
import { wallEndAdjust } from "./walls";
import { newId } from "./ids";
import { nextTint } from "../render/theme";
import { snapToNode } from "../ui/snapping";
import type { Opening, OpeningKind, Point, Project, Room, WallOffsets } from "./types";

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

/** Commit a drawn chain of points as walls, reusing existing nodes where they coincide. */
export function commitWallChain(p: Project, points: Point[], thickness = 100): Project {
  if (points.length < 2) return p;
  let proj = p;
  const ids: string[] = [];

  for (const pt of points) {
    const existing = proj.nodes.find((n) => n.x === pt.x && n.y === pt.y);
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const r = addNode(proj, pt);
    proj = r.project;
    ids.push(r.node.id);
  }

  for (let i = 0; i < ids.length - 1; i += 1) {
    if (ids[i] === ids[i + 1]) continue;
    proj = addWall(proj, ids[i], ids[i + 1], thickness).project;
  }
  return touch(proj);
}

const DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 900, height: 2050, sill: 0 },
  window: { width: 1200, height: 1400, sill: 900 },
  passage: { width: 1000, height: 2100, sill: 0 },
  // A typical extract vent, high on the wall and clear of a 2050 door head.
  vent: { width: 150, height: 150, sill: 2200 },
};

/** Place an opening at a measured distance along the wall, clamped to stay on it. */
export function addOpeningAtOffset(
  p: Project,
  wallId: string,
  offsetMm: number,
  kind: OpeningKind,
): { project: Project; id: string } {
  const len = wallLength(p, wallId) || 1;
  const d = DEFAULTS[kind];
  const half = d.width / 2;
  const offset = Math.round(Math.min(Math.max(offsetMm, half), Math.max(len - half, half)));

  const opening: Opening = {
    id: newId("o"),
    wallId,
    kind,
    offset,
    ...d,
    ...(kind === "door" ? { hinge: "a" as const, swing: "in" as const } : {}),
  };
  return { project: touch({ ...p, openings: [...p.openings, opening] }), id: opening.id };
}

/**
 * Place an opening where the user clicked. The numbers are meant to be corrected by
 * typing; the click only picks a starting point.
 */
export function addOpening(
  p: Project,
  wallId: string,
  at: Point,
  kind: OpeningKind,
): { project: Project; id: string } {
  const { a, b } = wallEnds(p, wallId);
  const len = wallLength(p, wallId) || 1;
  const t = ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / (len * len);
  return addOpeningAtOffset(p, wallId, t * len, kind);
}

export function addRoom(p: Project, polygon: Point[], name?: string): { project: Project; id: string } {
  const room: Room = {
    id: newId("r"),
    name: name ?? `Room ${p.rooms.length + 1}`,
    polygon: polygon.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) })),
    tint: nextTint(p.rooms.length),
  };
  return { project: touch({ ...p, rooms: [...p.rooms, room] }), id: room.id };
}

export function updateRoom(p: Project, id: string, patch: Partial<Room>): Project {
  return touch({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

export function updateOpening(p: Project, id: string, patch: Partial<Opening>): Project {
  return touch({
    ...p,
    openings: p.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  });
}

export function updateWall(
  p: Project,
  id: string,
  patch: { offsets?: WallOffsets; height?: number | undefined },
): Project {
  return touch({ ...p, walls: p.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}

/**
 * Move a node. Dropping it onto the partner it was split from re-closes the loop, which
 * is how a user resolves an open-loop warning by hand.
 */
export function moveNode(p: Project, id: string, to: Point): Project {
  const moved = touch({
    ...p,
    nodes: p.nodes.map((n) =>
      n.id === id ? { ...n, x: Math.round(to.x), y: Math.round(to.y) } : n,
    ),
  });
  const node = moved.nodes.find((n) => n.id === id);
  if (node?.openFrom) {
    const partner = moved.nodes.find((n) => n.id === node.openFrom);
    if (partner && snapToNode({ ...moved, nodes: [partner] }, to)) {
      return mergeOpenNode(moved, id);
    }
  }
  return moved;
}

export function deleteWall(p: Project, id: string): Project {
  const remainingWalls = p.walls.filter((w) => w.id !== id);
  const used = new Set(remainingWalls.flatMap((w) => [w.a, w.b]));
  return touch({
    ...p,
    walls: remainingWalls,
    openings: p.openings.filter((o) => o.wallId !== id),
    nodes: p.nodes.filter((n) => used.has(n.id)),
  });
}

export function deleteOpening(p: Project, id: string): Project {
  return touch({ ...p, openings: p.openings.filter((o) => o.id !== id) });
}

export function deleteRoom(p: Project, id: string): Project {
  return touch({ ...p, rooms: p.rooms.filter((r) => r.id !== id) });
}

/**
 * Set the length of one of a wall's faces, leaving the centreline and the other face
 * exactly where they are.
 *
 * The whole change goes to the wall's far end, so the near end stays put and only that
 * one face moves. The end stops being square to the wall, which is the point: a wall
 * whose two faces are different lengths has a slanted end, and real corners are not
 * always square.
 *
 * The centreline is untouched, so nothing downstream of this wall moves either.
 */
export function setWallFaceLength(
  p: Project,
  id: string,
  side: number,
  target: number,
): Project {
  const wall = p.walls.find((w) => w.id === id);
  if (!wall || target <= 0) return p;

  const current = wallLengthForSide(p, id, side);
  const delta = Math.round(target - current);
  if (delta === 0) return p;

  const ends = wallEndAdjust(wall);
  const key = side >= 0 ? "left" : "right";
  const next = {
    a: { ...ends.a },
    b: { ...ends.b, [key]: ends.b[key] + delta },
  };

  return touch({
    ...p,
    walls: p.walls.map((w) => (w.id === id ? { ...w, ends: next } : w)),
  });
}

/** Put both ends of a wall back square to it, undoing any slant. */
export function squareWallEnds(p: Project, id: string): Project {
  return touch({
    ...p,
    walls: p.walls.map((w) => (w.id === id ? { ...w, ends: undefined } : w)),
  });
}
