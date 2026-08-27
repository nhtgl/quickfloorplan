import { SCHEMA, type Project } from "../model/types";

export function serialize(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export type LoadResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };

function isPointArray(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as { x: unknown }).x === "number" &&
        typeof (p as { y: unknown }).y === "number",
    )
  );
}

/**
 * Validates before anything is applied, and names the actual problem. A corrupt file
 * must never take out the work already open.
 */
export function deserialize(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "That file does not contain a project." };
  }

  const p = raw as Partial<Project>;
  if (!p.schema) return { ok: false, error: "That file has no `schema` field, so it is not a QuickFloorPlan project." };
  if (p.schema !== SCHEMA) {
    return {
      ok: false,
      error: `That file says schema "${p.schema}", but this version reads "${SCHEMA}".`,
    };
  }

  for (const field of ["nodes", "walls", "openings", "rooms"] as const) {
    if (!Array.isArray(p[field])) {
      return { ok: false, error: `Project is missing its \`${field}\` list.` };
    }
  }
  if (typeof p.defaultWallHeight !== "number") {
    return { ok: false, error: "Project is missing a default wall height." };
  }

  const nodeIds = new Set((p.nodes ?? []).map((n) => n.id));
  for (const w of p.walls ?? []) {
    if (!nodeIds.has(w.a) || !nodeIds.has(w.b)) {
      return { ok: false, error: `Wall ${w.label ?? w.id} refers to a node that is not in the file.` };
    }
  }
  const wallIds = new Set((p.walls ?? []).map((w) => w.id));
  for (const o of p.openings ?? []) {
    if (!wallIds.has(o.wallId)) {
      return { ok: false, error: `An opening refers to a wall that is not in the file.` };
    }
  }
  for (const r of p.rooms ?? []) {
    if (!isPointArray(r.polygon)) {
      return { ok: false, error: `Room "${r.name ?? r.id}" has a malformed outline.` };
    }
  }

  return { ok: true, project: p as Project };
}
