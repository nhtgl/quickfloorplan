import { newId } from "./ids";
import type { NodeId, PlanNode, Point, Project, Wall, WallId } from "./types";

export function nodeById(p: Project, id: NodeId): PlanNode {
  const n = p.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

export function wallById(p: Project, id: WallId): Wall {
  const w = p.walls.find((x) => x.id === id);
  if (!w) throw new Error(`no wall ${id}`);
  return w;
}

export function wallEnds(p: Project, id: WallId): { a: PlanNode; b: PlanNode } {
  const w = wallById(p, id);
  return { a: nodeById(p, w.a), b: nodeById(p, w.b) };
}

export function wallVector(p: Project, id: WallId): Point {
  const { a, b } = wallEnds(p, id);
  return { x: b.x - a.x, y: b.y - a.y };
}

export function wallLength(p: Project, id: WallId): number {
  const v = wallVector(p, id);
  return Math.round(Math.hypot(v.x, v.y));
}

export function wallHeight(p: Project, id: WallId): number {
  return wallById(p, id).height ?? p.defaultWallHeight;
}

/**
 * A split node still stands in for the node it came from. Chain walking and angle
 * measurement must see through the split, or a broken loop would also lose track of
 * which walls are neighbours.
 */
export function resolveNode(p: Project, id: NodeId): NodeId {
  const n = p.nodes.find((x) => x.id === id);
  return n?.openFrom ?? id;
}

/**
 * Wall ids downstream of `id`, following shared nodes. Stops on returning to `id`, and
 * optionally before `stopBefore` so a caller can hold part of the loop fixed.
 */
export function chainFrom(p: Project, id: WallId, stopBefore?: WallId): WallId[] {
  const out: WallId[] = [];
  const seen = new Set<WallId>([id]);
  let current = wallById(p, id);
  for (;;) {
    const next = p.walls.find((w) => resolveNode(p, current.b) === w.a && !seen.has(w.id));
    if (!next || next.id === stopBefore) return out;
    out.push(next.id);
    seen.add(next.id);
    current = next;
  }
}

/** The wall immediately upstream, or null at the head of an open chain. */
export function previousWall(p: Project, id: WallId): Wall | null {
  const w = wallById(p, id);
  return p.walls.find((x) => resolveNode(p, x.b) === w.a && x.id !== w.id) ?? null;
}

/**
 * Signed turn in degrees from the previous wall's direction to this one's. Positive
 * turns clockwise on screen (+y is down). Null when there is no previous wall, or when
 * either wall is degenerate — a zero-length wall has no direction, and returning NaN
 * would poison every number downstream of it.
 */
export function wallAngleDeg(p: Project, id: WallId): number | null {
  const prev = previousWall(p, id);
  if (!prev) return null;
  const u = wallVector(p, prev.id);
  const v = wallVector(p, id);
  if (Math.hypot(u.x, u.y) === 0 || Math.hypot(v.x, v.y) === 0) return null;
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/**
 * Apply `xf` to the far end of `id` and to every node downstream of it, holding
 * `fixed` still.
 *
 * Where a downstream wall runs back into a fixed node, the loop is over-constrained.
 * Rather than let the closing wall silently stretch to absorb the difference, the node
 * is split: the closing wall gets a new endpoint at the transformed position and records
 * `openFrom`, so the loop visibly comes apart by exactly the amount the edit demanded.
 * `loopGap` measures it and the UI badges it until the user resolves it.
 */
function transformDownstream(
  p: Project,
  id: WallId,
  xf: (pt: Point) => Point,
  fixed: Set<NodeId>,
  stopBefore?: WallId,
): Project {
  const start = wallById(p, id);
  const downstream = chainFrom(p, id, stopBefore);
  const order = [start.b, ...downstream.map((w) => wallById(p, w).b)];

  const handled = new Set<NodeId>();
  let nodes = [...p.nodes];
  let walls = [...p.walls];

  for (const nodeId of order) {
    if (handled.has(nodeId)) continue;
    handled.add(nodeId);
    const node = nodes.find((n) => n.id === nodeId)!;
    const next = xf({ x: node.x, y: node.y });
    const rounded = { x: Math.round(next.x), y: Math.round(next.y) };

    if (fixed.has(nodeId)) {
      const split: PlanNode = {
        id: newId("n"),
        ...rounded,
        openFrom: node.openFrom ?? nodeId,
      };
      nodes = [...nodes, split];
      // Only the wall arriving from downstream re-points; the fixed side keeps the node.
      const arriving = downstream.filter((w) => wallById(p, w).b === nodeId);
      walls = walls.map((w) =>
        arriving.includes(w.id) ? { ...w, b: split.id } : w,
      );
    } else {
      nodes = nodes.map((n) => (n.id === nodeId ? { ...n, ...rounded } : n));
    }
  }

  return { ...p, nodes, walls, updatedAt: new Date().toISOString() };
}

export function setWallLength(p: Project, id: WallId, mm: number): Project {
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0 || mm <= 0) return p;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const delta = { x: a.x + ux * mm - b.x, y: a.y + uy * mm - b.y };
  // Only the wall's own start is held: length is measured from it.
  return transformDownstream(
    p,
    id,
    (pt) => ({ x: pt.x + delta.x, y: pt.y + delta.y }),
    new Set([wallById(p, id).a]),
  );
}

export function setWallAngleDeg(p: Project, id: WallId, deg: number): Project {
  const current = wallAngleDeg(p, id);
  if (current === null) return p;
  const prev = previousWall(p, id)!;
  const pivot = wallEnds(p, id).a;
  const rad = ((deg - current) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // An angle is defined against the previous wall, so that wall is the reference frame
  // and is held whole — rotating it too would leave the angle unchanged.
  return transformDownstream(
    p,
    id,
    (pt) => {
      const dx = pt.x - pivot.x;
      const dy = pt.y - pivot.y;
      return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
    },
    new Set([wallById(p, id).a, prev.a, prev.b]),
    prev.id,
  );
}

/**
 * How far a once-closed loop is out of true, in mm. Zero for a loop that still closes
 * and for an open chain, which cannot be out of true in the first place.
 */
export function loopGap(p: Project, id: WallId): number {
  const downstream = chainFrom(p, id);
  const lastId = downstream.length ? downstream[downstream.length - 1] : id;
  const end = nodeById(p, wallById(p, lastId).b);
  if (!end.openFrom) return 0;
  const partner = p.nodes.find((n) => n.id === end.openFrom);
  if (!partner) return 0;
  return Math.round(Math.hypot(end.x - partner.x, end.y - partner.y));
}

/** Every open loop in the project, for badging. */
export function openLoops(p: Project): { nodeId: NodeId; partnerId: NodeId; gap: number }[] {
  return p.nodes
    .filter((n) => n.openFrom)
    .map((n) => {
      const partner = p.nodes.find((x) => x.id === n.openFrom);
      if (!partner) return null;
      return {
        nodeId: n.id,
        partnerId: partner.id,
        gap: Math.round(Math.hypot(n.x - partner.x, n.y - partner.y)),
      };
    })
    .filter((x): x is { nodeId: NodeId; partnerId: NodeId; gap: number } => x !== null);
}

/** Re-close a split loop by merging a node back onto the partner it came from. */
export function mergeOpenNode(p: Project, nodeId: NodeId): Project {
  const node = p.nodes.find((n) => n.id === nodeId);
  if (!node?.openFrom) return p;
  const target = node.openFrom;
  return {
    ...p,
    nodes: p.nodes.filter((n) => n.id !== nodeId),
    walls: p.walls.map((w) => ({
      ...w,
      a: w.a === nodeId ? target : w.a,
      b: w.b === nodeId ? target : w.b,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/** A point a measured distance along a wall's centreline from end a. */
export function pointAlongWall(p: Project, id: WallId, distance: number): Point {
  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {
    x: a.x + ((b.x - a.x) / len) * distance,
    y: a.y + ((b.y - a.y) / len) * distance,
  };
}

/** The wall immediately downstream, or null at the end of an open chain. */
export function nextWall(p: Project, id: WallId): Wall | null {
  const w = wallById(p, id);
  return p.walls.find((x) => x.a === resolveNode(p, w.b) && x.id !== w.id) ?? null;
}

/**
 * Signed area of the loop this wall belongs to, or null if the wall is not part of a
 * closed run. The sign says which way the loop winds, which is the only way to know
 * which side of a wall is the inside.
 */
export function loopSignedArea(p: Project, id: WallId): number | null {
  const chain = [id, ...chainFrom(p, id)];
  const last = wallById(p, chain[chain.length - 1]);
  const first = wallById(p, id);
  if (resolveNode(p, last.b) !== first.a) return null;

  const pts = chain.map((wid) => nodeById(p, wallById(p, wid).a));
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
