import { allFaceCorners } from "../model/faces";
import type { Point, Project } from "../model/types";

/** Magnet radius for landing exactly on an existing corner, in screen pixels. */
export const SNAP_RADIUS_PX = 12;

/** How close a corner must line up before an alignment guide appears, in screen pixels. */
export const ALIGN_TOLERANCE_PX = 8;

/** Fallback magnet radius in mm, for callers that have no zoom level to hand. */
export const SNAP_RADIUS_MM = 250;

export const ANGLE_STEP_DEG = 15;

/** A corner the point being placed lines up with, and on which axis. */
export type Guide = { axis: "x" | "y"; from: Point };

/** What the point landed on: a wall centreline corner, or a corner of a wall's face. */
export type SnapKind = "corner" | "face" | "none";

export type SnapResult = {
  point: Point;
  guides: Guide[];
  /** True when the point landed on something rather than merely aligning with it. */
  onCorner: boolean;
  kind: SnapKind;
};

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** Nearest candidate within the magnet radius, with how far away it was. */
export function nearestWithin(
  candidates: Point[],
  raw: Point,
  radius: number,
): { pt: Point; d: number } | null {
  let best: { pt: Point; d: number } | null = null;
  for (const c of candidates) {
    const d = Math.hypot(c.x - raw.x, c.y - raw.y);
    if (d <= radius && (!best || d < best.d)) best = { pt: { x: c.x, y: c.y }, d };
  }
  return best;
}

/** Nearest candidate within the magnet radius, so corners actually meet. */
export function snapToNearest(
  candidates: Point[],
  raw: Point,
  radius: number,
): Point | null {
  return nearestWithin(candidates, raw, radius)?.pt ?? null;
}

export function snapToNode(p: Project, raw: Point, radius = SNAP_RADIUS_MM): Point | null {
  return snapToNearest(p.nodes, raw, radius);
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
    x: origin.x + Math.cos(rad) * dist,
    y: origin.y + Math.sin(rad) * dist,
  };
}

/**
 * Where a corner being placed should actually land, and which existing corners it lines
 * up with.
 *
 * The order matters. Landing exactly on an existing corner beats everything, because a
 * near-miss corner is the failure that ruins a plan. Alignment comes next: lining up with
 * a corner across the room is a stronger statement of intent than a tidy angle, and it
 * subsumes the horizontal and vertical cases anyway, since the run's own previous corner
 * is one of the things being aligned to. The 15° lock only applies when nothing lines up.
 *
 * Tolerances are in screen pixels so the feel stays the same at any zoom. Holding Alt
 * turns off both alignment and the angle lock, which is the escape hatch when a wall
 * genuinely sits a couple of centimetres off square.
 */
export function resolveSnap({
  project,
  raw,
  origin,
  freeAngle,
  draftPoints,
  mmPerPx,
}: {
  project: Project;
  raw: Point;
  origin: Point | null;
  freeAngle: boolean;
  draftPoints: Point[];
  mmPerPx: number;
}): SnapResult {
  // Corners being drawn right now count alongside committed ones. Without them the run's
  // own first corner is unreachable and a shape can never be closed.
  const candidates: Point[] = [
    ...draftPoints,
    ...project.nodes.map((n) => ({ x: n.x, y: n.y })),
  ];

  const magnet = SNAP_RADIUS_PX * mmPerPx;

  // A corner of the run being drawn wins outright, whatever else is nearby. Clicking the
  // run's own first corner is how a shape gets closed, and nothing may steal that.
  const onDraft = snapToNearest(draftPoints, raw, magnet);
  if (onDraft) return { point: round(onDraft), guides: [], onCorner: true, kind: "corner" };

  // Otherwise the nearest of the wall corners and the corners of the wall faces. A face
  // corner sits only half a thickness from its centreline corner, so preferring corners
  // outright would put the faces permanently out of reach — and the faces are the points
  // anyone measuring a room actually works from.
  const faces = allFaceCorners(project).map((c) => c.point);
  const nearestCorner = nearestWithin(
    project.nodes.map((n) => ({ x: n.x, y: n.y })),
    raw,
    magnet,
  );
  const nearestFace = nearestWithin(faces, raw, magnet);
  if (nearestCorner || nearestFace) {
    const takeFace = nearestFace && (!nearestCorner || nearestFace.d < nearestCorner.d);
    const hit = takeFace ? nearestFace! : nearestCorner!;
    return {
      point: round(hit.pt),
      guides: [],
      onCorner: true,
      kind: takeFace ? "face" : "corner",
    };
  }

  if (freeAngle) return { point: round(raw), guides: [], onCorner: false, kind: "none" };

  const tolerance = ALIGN_TOLERANCE_PX * mmPerPx;
  // Faces line up as readily as centrelines do.
  candidates.push(...faces);
  let alignX: Point | null = null;
  let alignY: Point | null = null;
  for (const c of candidates) {
    const dx = Math.abs(c.x - raw.x);
    const dy = Math.abs(c.y - raw.y);
    if (dx <= tolerance && (!alignX || dx < Math.abs(alignX.x - raw.x))) alignX = c;
    if (dy <= tolerance && (!alignY || dy < Math.abs(alignY.y - raw.y))) alignY = c;
  }

  if (!alignX && !alignY) {
    return {
      point: round(origin ? snapAngle(origin, raw) : raw),
      guides: [],
      onCorner: false,
      kind: "none",
    };
  }

  const guides: Guide[] = [];
  if (alignX) guides.push({ axis: "x", from: alignX });
  if (alignY) guides.push({ axis: "y", from: alignY });

  return {
    point: round({ x: alignX ? alignX.x : raw.x, y: alignY ? alignY.y : raw.y }),
    guides,
    onCorner: false,
    kind: "none",
  };
}
