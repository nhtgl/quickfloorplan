import { wallById, wallEnds, wallLength } from "./geometry";
import type { OpeningId, Point, Project } from "./types";

export function openingById(p: Project, id: OpeningId) {
  const o = p.openings.find((x) => x.id === id);
  if (!o) throw new Error(`no opening ${id}`);
  return o;
}

/**
 * The opening's box on its wall's elevation drawing: x measured along the wall from
 * end a, y measured up from the floor.
 */
export function openingRect(
  p: Project,
  id: OpeningId,
): { x: number; y: number; w: number; h: number } {
  const o = openingById(p, id);
  return { x: Math.round(o.offset - o.width / 2), y: o.sill, w: o.width, h: o.height };
}

/** The opening's span in plan coordinates, along the wall centreline. */
export function openingPlanSegment(
  p: Project,
  id: OpeningId,
): { from: Point; to: Point } {
  const o = openingById(p, id);
  const { a, b } = wallEnds(p, o.wallId);
  const len = wallLength(p, o.wallId) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const start = o.offset - o.width / 2;
  const end = o.offset + o.width / 2;
  return {
    from: { x: Math.round(a.x + ux * start), y: Math.round(a.y + uy * start) },
    to: { x: Math.round(a.x + ux * end), y: Math.round(a.y + uy * end) },
  };
}

/**
 * The quarter-arc a door leaf sweeps in plan, or null if the opening is not a door.
 * `swing: "in"` is the left-hand side of the a->b direction vector; the convention is
 * arbitrary but fixed, so the plan symbol and any future consumer agree.
 */
export function doorSwingArc(
  p: Project,
  id: OpeningId,
): { cx: number; cy: number; r: number; startDeg: number; endDeg: number } | null {
  const o = openingById(p, id);
  if (o.kind !== "door") return null;
  const seg = openingPlanSegment(p, id);
  const hingeAtA = (o.hinge ?? "a") === "a";
  const hinge = hingeAtA ? seg.from : seg.to;
  const { a, b } = wallEnds(p, o.wallId);
  const wallDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const along = hingeAtA ? wallDeg : wallDeg + 180;
  const sweep = (o.swing ?? "in") === "in" ? 90 : -90;
  return {
    cx: hinge.x,
    cy: hinge.y,
    r: o.width,
    startDeg: along,
    endDeg: along + sweep,
  };
}

/** Opening extent along its wall, as [start, end] in mm from end a. */
export function openingSpan(p: Project, id: OpeningId): [number, number] {
  const o = openingById(p, id);
  return [o.offset - o.width / 2, o.offset + o.width / 2];
}

export function wallForOpening(p: Project, id: OpeningId) {
  return wallById(p, openingById(p, id).wallId);
}
