import { wallById, wallEnds, wallLength } from "./geometry";
import { wallSpanForSide } from "./measure";
import { viewSpan, wallOpeningViews } from "./sharedOpenings";
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

/**
 * Where along a wall its label can sit and still be read. The label is drawn in reverse
 * out of the wall's own fill, so putting it over an opening — which is a gap, not fill —
 * makes it disappear. This returns the middle of the widest stretch of solid wall.
 */
export function labelOffsetAlongWall(p: Project, wallId: string): number {
  const len = wallLength(p, wallId);
  const spans = wallOpeningViews(p, wallId)
    .map((view) => viewSpan(view))
    .sort((a, b) => a[0] - b[0]);

  let best: [number, number] = [0, len];
  let bestWidth = -1;
  let cursor = 0;
  for (const [start, end] of [...spans, [len, len] as [number, number]]) {
    const gap = Math.min(start, len) - cursor;
    if (gap > bestWidth) {
      bestWidth = gap;
      best = [cursor, Math.min(start, len)];
    }
    cursor = Math.max(cursor, Math.min(end, len));
  }
  if (bestWidth <= 0) return len / 2;
  return (best[0] + best[1]) / 2;
}

export type ChainSegment = {
  /** mm from wall end a */
  start: number;
  end: number;
  kind: "solid" | "opening";
  openingIds: string[];
};

/**
 * The setting-out chain for a wall: corner to the first opening, the opening itself,
 * the solid stretch to the next, and so on to the far corner. The segments tile the wall
 * end to end, so they add up to its length — which is what makes the chain checkable on
 * site with a tape.
 *
 * Openings that overlap are merged into one segment. Leaving them separate would make the
 * chain sum to more than the wall, and a dimension chain that does not add up is worse
 * than none. The overlap itself is already reported as a warning.
 */
export function wallDimensionChain(
  p: Project,
  wallId: string,
  side: number = 0,
): ChainSegment[] {
  const span = wallSpanForSide(p, wallId, side);
  const clamp = (v: number) => Math.max(span.start, Math.min(span.end, v));

  const spans = wallOpeningViews(p, wallId)
    .map((view) => {
      const [start, end] = viewSpan(view);
      return { id: view.opening.id, start: clamp(start), end: clamp(end) };
    })
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number; ids: string[] }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      last.ids.push(s.id);
    } else {
      merged.push({ start: s.start, end: s.end, ids: [s.id] });
    }
  }

  const out: ChainSegment[] = [];
  let cursor = span.start;
  for (const m of merged) {
    if (m.start > cursor) {
      out.push({ start: cursor, end: m.start, kind: "solid", openingIds: [] });
    }
    out.push({ start: m.start, end: m.end, kind: "opening", openingIds: m.ids });
    cursor = m.end;
  }
  if (span.end > cursor) {
    out.push({ start: cursor, end: span.end, kind: "solid", openingIds: [] });
  }
  return out;
}
