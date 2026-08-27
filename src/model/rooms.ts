import { wallEnds } from "./geometry";
import type { Point, Project, Room, RoomId, WallId } from "./types";

/**
 * A wall counts as bordering a room when at least this much of its centreline runs
 * along the room's boundary. The threshold stops a wall that merely clips a room's
 * corner from being tagged with it.
 */
export const ROOM_MATCH_FRACTION = 0.25;

/**
 * Slack on top of half the wall thickness. A room edge snapped to a wall sits on the
 * wall's inner face, half a thickness off the centreline; this covers edges the user
 * placed by eye instead.
 */
export const ROOM_MATCH_SLACK_MM = 150;

const SAMPLES = 101;

/** Shoelace. Absolute, so winding direction does not matter. Returns mm². */
export function roomArea(room: Room): number {
  const pts = room.polygon;
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.round(Math.abs(sum) / 2);
}

function edges(poly: Point[]): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Point, Point]);
}

function orient(a: Point, b: Point, c: Point): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v === 0 ? 0 : v > 0 ? 1 : -1;
}

/**
 * True only for a genuine crossing. Segments that merely touch at an endpoint, or lie
 * collinear along each other, do not count — two rooms sharing an edge are adjacent,
 * not overlapping, and that is the whole point of decoupling rooms from walls.
 */
function properlyCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = orient(a1, a2, b1);
  const d2 = orient(a1, a2, b2);
  const d3 = orient(b1, b2, a1);
  const d4 = orient(b1, b2, a2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolygonBoundary(p: Point, poly: Point[]): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) return Math.hypot(p.x - poly[0].x, p.y - poly[0].y);
  return Math.min(...edges(poly).map(([a, b]) => distanceToSegment(p, a, b)));
}

export function pointOnBoundary(p: Point, poly: Point[], tol = 1e-6): boolean {
  return distanceToPolygonBoundary(p, poly) <= tol;
}

/** Strictly inside: a point sitting on the boundary is not inside. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  if (pointOnBoundary(p, poly)) return false;
  let inside = false;
  for (const [a, b] of edges(poly)) {
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (p.x < x) inside = !inside;
  }
  return inside;
}

export function polygonSelfIntersects(poly: Point[]): boolean {
  const es = edges(poly);
  if (es.length < 4) return false;
  for (let i = 0; i < es.length; i += 1) {
    for (let j = i + 1; j < es.length; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === es.length - 1);
      if (adjacent) continue;
      if (properlyCross(es[i][0], es[i][1], es[j][0], es[j][1])) return true;
    }
  }
  return false;
}

export function roomsOverlap(a: Room, b: Room): boolean {
  if (a.polygon.length < 3 || b.polygon.length < 3) return false;
  for (const [a1, a2] of edges(a.polygon)) {
    for (const [b1, b2] of edges(b.polygon)) {
      if (properlyCross(a1, a2, b1, b2)) return true;
    }
  }
  // Covers containment, where no edges cross at all.
  return (
    a.polygon.some((p) => pointInPolygon(p, b.polygon)) ||
    b.polygon.some((p) => pointInPolygon(p, a.polygon))
  );
}

function wallBordersRoom(p: Project, wallId: WallId, room: Room): boolean {
  if (room.polygon.length < 2) return false;
  const { a, b } = wallEnds(p, wallId);
  const wall = p.walls.find((w) => w.id === wallId)!;
  const tolerance = wall.thickness / 2 + ROOM_MATCH_SLACK_MM;
  let hits = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / (SAMPLES - 1);
    const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (distanceToPolygonBoundary(pt, room.polygon) <= tolerance) hits += 1;
  }
  return hits / SAMPLES >= ROOM_MATCH_FRACTION;
}

export function roomsForWall(p: Project, wallId: WallId): RoomId[] {
  return p.rooms.filter((r) => wallBordersRoom(p, wallId, r)).map((r) => r.id);
}

export function wallsForRoom(p: Project, roomId: RoomId): WallId[] {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  return p.walls.filter((w) => wallBordersRoom(p, w.id, room)).map((w) => w.id);
}

/**
 * Whether a room edge has a wall behind it. Edges without one are notional boundaries —
 * the imaginary line between a dining area and a hall — and the plan draws them dashed
 * so nobody quotes for a partition that was never there.
 */
export function edgeHasWallBehind(p: Project, a: Point, b: Point): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return false;
  for (const wall of p.walls) {
    const ends = wallEnds(p, wall.id);
    const tolerance = wall.thickness / 2 + ROOM_MATCH_SLACK_MM;
    let hits = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      const t = i / (SAMPLES - 1);
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (distanceToSegment(pt, ends.a, ends.b) <= tolerance) hits += 1;
    }
    if (hits / SAMPLES >= 0.9) return true;
  }
  return false;
}
