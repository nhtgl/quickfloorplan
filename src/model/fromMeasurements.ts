import { addWall, projectUnit } from "./factory";
import { newId } from "./ids";
import { projectMeasureFrom, wallFaceCornerAfter } from "./measure";
import { planBounds } from "../render/bounds";
import { nextTint } from "../render/theme";
import type { PlanNode, Point, Project, Room } from "./types";
import { parseLength } from "./units";

export type Parsed = {
  /** mm */
  lengths: number[];
  /** degrees, the turn taken after each length; positive turns one way, negative the other */
  angles: number[];
};

export type ParseResult = { ok: true; value: Parsed } | { ok: false; error: string };

/**
 * Read a typed run of measurements.
 *
 * The default reading is alternating length and turn — "250, 90, 100, 90" is a 250 wall,
 * a 90 degree turn, a 100 wall, a 90 degree turn — because that is how the walls of a
 * room get dictated out loud, and it is the shape of the model underneath. Setting
 * `rightAngles` instead reads every number as a length and turns 90 degrees between them.
 */
export function parseMeasurements(
  text: string,
  unit: "cm" | "m",
  rightAngles: boolean,
): ParseResult {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { ok: false, error: "Type some measurements to begin." };

  const numbers: number[] = [];
  for (const t of tokens) {
    const n = Number(t);
    if (!Number.isFinite(n)) return { ok: false, error: `"${t}" is not a number.` };
    numbers.push(n);
  }

  if (rightAngles) {
    if (numbers.some((n) => n <= 0)) {
      return { ok: false, error: "Wall lengths have to be greater than zero." };
    }
    if (numbers.length < 3) {
      return { ok: false, error: "A room needs at least three walls." };
    }
    return {
      ok: true,
      value: {
        lengths: numbers.map((n) => parseLength(n, unit)),
        angles: numbers.map(() => 90),
      },
    };
  }

  const lengths: number[] = [];
  const angles: number[] = [];
  numbers.forEach((n, i) => (i % 2 === 0 ? lengths.push(n) : angles.push(n)));

  if (lengths.some((n) => n <= 0)) {
    return { ok: false, error: "Wall lengths have to be greater than zero." };
  }
  if (lengths.length < 3) {
    return { ok: false, error: "A room needs at least three walls." };
  }
  if (angles.some((a) => Math.abs(a) >= 180)) {
    return { ok: false, error: "Turns have to be less than 180 degrees." };
  }
  // A trailing turn back onto the first wall is welcome but not needed to draw anything.
  while (angles.length < lengths.length) angles.push(90);

  return {
    ok: true,
    value: { lengths: lengths.map((n) => parseLength(n, unit)), angles },
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Walk a run of lengths and turns, starting east from `origin`. */
function walk(origin: Point, lengths: number[], angles: number[]): Point[] {
  const pts: Point[] = [origin];
  let heading = 0;
  let at = origin;
  lengths.forEach((len, i) => {
    if (i > 0) heading += angles[i - 1];
    at = {
      x: at.x + Math.cos(rad(heading)) * len,
      y: at.y + Math.sin(rad(heading)) * len,
    };
    pts.push({ x: Math.round(at.x), y: Math.round(at.y) });
  });
  return pts;
}

function signedArea(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Turn typed lengths into centreline lengths.
 *
 * Typed numbers mean whatever the project measures from, so when that is the inside
 * faces the centreline has to be longer by the corner deductions at each end. Those
 * depend only on the turn angles and the wall thickness, both of which are already known
 * from the input, so a single pass is exact.
 */
function centrelineLengths(
  measured: number[],
  angles: number[],
  thickness: number,
  faceSign: number,
): number[] {
  if (faceSign === 0) return measured;
  const n = measured.length;
  const half = thickness / 2;

  const trim = (turn: number) => {
    const sin = Math.sin(rad(turn));
    // Collinear walls have parallel faces that never meet: nothing to trim.
    if (Math.abs(sin) < 1e-6) return 0;
    return (faceSign * (half * Math.cos(rad(turn)) - half)) / sin;
  };

  return measured.map((m, i) => {
    const turnAfter = angles[i % angles.length];
    const turnBefore = angles[(i - 1 + n) % angles.length];
    return Math.max(1, Math.round(m - trim(turnAfter) - trim(turnBefore)));
  });
}

export type BuildResult = {
  project: Project;
  roomId: string | null;
  /** How far the run misses its own start, in mm. */
  gap: number;
};

/**
 * Add a closed run of walls, and the room they enclose, built from typed measurements.
 * Placed clear of anything already drawn so it never lands on top of existing work.
 */
export function buildFromMeasurements(
  p: Project,
  parsed: Parsed,
  opts: { thickness: number; name: string },
): BuildResult {
  const measureFrom = projectMeasureFrom(p);

  // The winding decides which side is inside, and it does not change when lengths are
  // nudged, so it can be read from a first pass at the typed sizes.
  const rough = walk({ x: 0, y: 0 }, parsed.lengths, parsed.angles);
  const winding = signedArea(rough.slice(0, -1)) > 0 ? 1 : -1;
  const faceSign =
    measureFrom === "centre" ? 0 : (measureFrom === "inside" ? 1 : -1) * winding;

  const centrelines = centrelineLengths(
    parsed.lengths,
    parsed.angles,
    opts.thickness,
    faceSign,
  );

  const bounds = planBounds(p);
  const origin = p.nodes.length
    ? { x: bounds.maxX + 2000, y: bounds.minY }
    : { x: 0, y: 0 };
  const pts = walk(origin, centrelines, parsed.angles);

  const closing = pts[pts.length - 1];
  const gap = Math.round(Math.hypot(closing.x - origin.x, closing.y - origin.y));

  // The last point is the run coming back to its start; the loop shares that node.
  const corners = pts.slice(0, -1);
  let proj = p;
  const nodes: PlanNode[] = [];
  for (const pt of corners) {
    const node: PlanNode = { id: newId("n"), x: pt.x, y: pt.y };
    nodes.push(node);
    proj = { ...proj, nodes: [...proj.nodes, node] };
  }
  const wallIds: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const r = addWall(proj, nodes[i].id, nodes[(i + 1) % nodes.length].id, opts.thickness);
    proj = r.project;
    wallIds.push(r.wall.id);
  }

  // A run that misses its own start by a long way encloses nothing recognisable, so no
  // room is added; the walls still are, and the usual open-loop warning covers the rest.
  const perimeter = centrelines.reduce((a, b) => a + b, 0);
  let roomId: string | null = null;
  if (gap <= Math.max(100, perimeter * 0.02)) {
    const polygon = wallIds.map((id) => wallFaceCornerAfter(proj, id));
    const room: Room = {
      id: newId("r"),
      name: opts.name.trim() || `Room ${proj.rooms.length + 1}`,
      polygon,
      tint: nextTint(proj.rooms.length),
    };
    proj = { ...proj, rooms: [...proj.rooms, room] };
    roomId = room.id;
  }

  return {
    project: { ...proj, updatedAt: new Date().toISOString() },
    roomId,
    gap,
  };
}

/** Convenience for the dialog's live preview. */
export function previewFromText(
  p: Project,
  text: string,
  rightAngles: boolean,
  opts: { thickness: number; name: string },
): { result: BuildResult } | { error: string } {
  const parsed = parseMeasurements(text, projectUnit(p), rightAngles);
  if (!parsed.ok) return { error: parsed.error };
  return { result: buildFromMeasurements(p, parsed.value, opts) };
}
