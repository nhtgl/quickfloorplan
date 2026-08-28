import {
  loopSignedArea,
  nextWall,
  pointAlongWall,
  previousWall,
  wallAngleDeg,
  wallById,
  wallEnds,
  wallLength,
} from "./geometry";
import type { Point, Project, WallId } from "./types";

/**
 * Which faces a wall's stated length runs between.
 *
 * Someone measuring a flat with a tape reads the clear distance between the inside
 * faces, so that is the default. Walls are still stored on their centrelines; this only
 * changes what a length means when it is shown or typed.
 */
export type MeasureFrom = "inside" | "centre" | "outside";

export const DEFAULT_MEASURE: MeasureFrom = "inside";

export function projectMeasureFrom(p: Project): MeasureFrom {
  return p.measureFrom ?? DEFAULT_MEASURE;
}

/** How far a wall's stated extent runs, as distances along its centreline from end a. */
export type Span = { start: number; end: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Where a wall's measured face begins and ends, along its centreline axis.
 *
 * At a corner, the face of this wall stops where it meets the face of its neighbour, so
 * the correction depends on the neighbour's thickness and the angle between them. For a
 * square corner it is simply half the neighbour's thickness; the general form falls out
 * of intersecting the two offset lines.
 *
 * A wall that is not part of a closed run has no inside, so it falls back to its
 * centreline rather than inventing a side.
 */
export function wallMeasuredSpan(p: Project, id: WallId): Span {
  const len = wallLength(p, id);
  const faceSign = wallFaceSign(p, id);
  if (faceSign === 0) return { start: 0, end: len };
  const half = wallById(p, id).thickness / 2;

  let start = 0;
  let end = len;

  const next = nextWall(p, id);
  if (next) {
    const turn = wallAngleDeg(p, next.id);
    const sin = turn === null ? 0 : Math.sin(rad(turn));
    // Collinear walls have parallel faces that never meet, so there is nothing to trim.
    if (turn !== null && Math.abs(sin) > 1e-6) {
      end = len + (faceSign * (half * Math.cos(rad(turn)) - next.thickness / 2)) / sin;
    }
  }

  const prev = previousWall(p, id);
  if (prev) {
    const turn = wallAngleDeg(p, id);
    const sin = turn === null ? 0 : Math.sin(rad(turn));
    if (turn !== null && Math.abs(sin) > 1e-6) {
      start = -(faceSign * (half * Math.cos(rad(turn)) - prev.thickness / 2)) / sin;
    }
  }

  return { start: Math.round(start), end: Math.round(end) };
}

/**
 * Which way, and whether, a wall's face is offset from its centreline. Zero when
 * measuring centrelines, or when the wall is not part of a closed run and so has no
 * inside to speak of. Positive offsets toward the left of the wall's own direction.
 */
export function wallFaceSign(p: Project, id: WallId): number {
  const mode = projectMeasureFrom(p);
  if (mode === "centre") return 0;
  const area = loopSignedArea(p, id);
  if (area === null || area === 0) return 0;
  return (mode === "inside" ? 1 : -1) * (area > 0 ? 1 : -1);
}

/**
 * The corner where this wall's measured face meets the next wall's. Walking these round
 * a closed run gives the polygon of the room the walls enclose.
 */
export function wallFaceCornerAfter(p: Project, id: WallId): Point {
  const span = wallMeasuredSpan(p, id);
  const on = pointAlongWall(p, id, span.end);
  const faceSign = wallFaceSign(p, id);
  if (faceSign === 0) return { x: Math.round(on.x), y: Math.round(on.y) };

  const { a, b } = wallEnds(p, id);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Left-hand normal of the wall's direction.
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const off = (faceSign * wallById(p, id).thickness) / 2;
  return { x: Math.round(on.x + nx * off), y: Math.round(on.y + ny * off) };
}

export function wallMeasuredLength(p: Project, id: WallId): number {
  const span = wallMeasuredSpan(p, id);
  return span.end - span.start;
}

/**
 * The centreline length that would give `measured` as the stated length. Typing a length
 * has to land on the face the user measured, not on the centreline they cannot see.
 *
 * The corner corrections depend only on angles and thicknesses, and a length edit moves
 * the downstream chain rigidly, so they survive the edit unchanged.
 */
export function centrelineForMeasured(p: Project, id: WallId, measured: number): number {
  const overhead = wallLength(p, id) - wallMeasuredLength(p, id);
  return Math.max(1, Math.round(measured + overhead));
}
