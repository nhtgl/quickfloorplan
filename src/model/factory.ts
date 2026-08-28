import { newId, nextWallLabel } from "./ids";
import { SCHEMA, type PlanNode, type Point, type Project, type Wall } from "./types";
import { DEFAULT_MEASURE } from "./measure";
import { DEFAULT_UNIT, type Unit } from "./units";

export function emptyProject(name = "Untitled"): Project {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    name,
    units: DEFAULT_UNIT,
    measureFrom: DEFAULT_MEASURE,
    defaultWallHeight: 2600,
    nodes: [],
    walls: [],
    openings: [],
    rooms: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addNode(p: Project, at: Point): { project: Project; node: PlanNode } {
  const node: PlanNode = { id: newId("n"), x: Math.round(at.x), y: Math.round(at.y) };
  return { project: { ...p, nodes: [...p.nodes, node] }, node };
}

export function addWall(
  p: Project,
  a: string,
  b: string,
  thickness = 100,
): { project: Project; wall: Wall } {
  const wall: Wall = {
    id: newId("w"),
    a,
    b,
    thickness,
    label: nextWallLabel(p.walls.map((w) => w.label)),
  };
  return { project: { ...p, walls: [...p.walls, wall] }, wall };
}

/**
 * Build a wall chain through the given points. Closing reuses the first node for the
 * last wall's end, so the corner is shared rather than duplicated.
 */
export function chainOfWalls(
  p: Project,
  points: Point[],
  close: boolean,
  thickness = 100,
): Project {
  let proj = p;
  const nodeIds: string[] = [];
  for (const pt of points) {
    const r = addNode(proj, pt);
    proj = r.project;
    nodeIds.push(r.node.id);
  }
  for (let i = 0; i < nodeIds.length - 1; i += 1) {
    proj = addWall(proj, nodeIds[i], nodeIds[i + 1], thickness).project;
  }
  if (close && nodeIds.length > 2) {
    proj = addWall(proj, nodeIds[nodeIds.length - 1], nodeIds[0], thickness).project;
  }
  return proj;
}

/** A project's display unit, defaulting for files written before units existed. */
export function projectUnit(p: Project): Unit {
  return p.units ?? DEFAULT_UNIT;
}
