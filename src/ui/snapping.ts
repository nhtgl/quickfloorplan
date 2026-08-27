import type { Point, Project } from "../model/types";

export const SNAP_RADIUS_MM = 250;
export const ANGLE_STEP_DEG = 15;

/** Nearest candidate within the magnet radius, so corners actually meet. */
export function snapToNearest(candidates: Point[], raw: Point): Point | null {
  let best: { pt: Point; d: number } | null = null;
  for (const c of candidates) {
    const d = Math.hypot(c.x - raw.x, c.y - raw.y);
    if (d <= SNAP_RADIUS_MM && (!best || d < best.d)) best = { pt: { x: c.x, y: c.y }, d };
  }
  return best?.pt ?? null;
}

export function snapToNode(p: Project, raw: Point): Point | null {
  return snapToNearest(p.nodes, raw);
}

/** Lock the direction from `origin` to the nearest 15 degrees, keeping the distance. */
export function snapAngle(origin: Point, raw: Point): Point {
  const dx = raw.x - origin.x;
  const dy = raw.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return raw;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const stepped = Math.round(deg / ANGLE_STEP_DEG) * ANGLE_STEP_DEG;
  const rad = (stepped * Math.PI) / 180;
  return {
    x: Math.round(origin.x + Math.cos(rad) * dist),
    y: Math.round(origin.y + Math.sin(rad) * dist),
  };
}

/**
 * Corner magnet first, then angle lock. Landing exactly on an existing corner matters
 * more than a tidy angle — a near-miss corner is the failure that ruins a plan.
 *
 * Corners being drawn right now count as targets too. Without them the angle lock
 * deflects a click aimed at the run's own first corner whenever the closing edge is not
 * already near a 15° multiple, and the shape can never be closed.
 */
export function snapPoint(
  p: Project,
  raw: Point,
  origin: Point | null,
  freeAngle: boolean,
  draftPoints: Point[] = [],
): Point {
  const magnet = snapToNearest([...draftPoints, ...p.nodes], raw);
  if (magnet) return magnet;
  if (origin && !freeAngle) return snapAngle(origin, raw);
  return { x: Math.round(raw.x), y: Math.round(raw.y) };
}
