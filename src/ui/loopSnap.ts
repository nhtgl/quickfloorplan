import { loopNodeIds } from "../model/loops";
import type { Point, Project, WallId } from "../model/types";
import { ALIGN_TOLERANCE_PX, type Guide } from "./snapping";

export type LoopSnap = { delta: Point; guides: Guide[] };

/**
 * Adjust a drag so the run being moved lands on another one.
 *
 * Each axis is settled on its own: the moved corner nearest to sharing an x with a
 * stationary corner pulls the whole run onto that x, and the same for y. Settling them
 * separately is what lets a room slide along a wall it is already flush with instead of
 * being yanked onto a corner.
 *
 * Corners snap onto corners, which for two rooms pushed together means their wall
 * centrelines coincide — one wall of that thickness between them, which is what a party
 * wall in a flat actually is.
 */
export function snapLoopDelta({
  project,
  wallId,
  rawDelta,
  mmPerPx,
}: {
  project: Project;
  wallId: WallId;
  rawDelta: Point;
  mmPerPx: number;
}): LoopSnap {
  const movingIds = new Set(loopNodeIds(project, wallId));
  const moving = project.nodes.filter((n) => movingIds.has(n.id));
  const stationary = project.nodes.filter((n) => !movingIds.has(n.id));
  if (moving.length === 0 || stationary.length === 0) {
    return { delta: rawDelta, guides: [] };
  }

  const tolerance = ALIGN_TOLERANCE_PX * mmPerPx;

  function best(axis: "x" | "y"): { adjust: number; from: Point } | null {
    let found: { adjust: number; from: Point } | null = null;
    for (const m of moving) {
      const at = m[axis] + rawDelta[axis];
      for (const s of stationary) {
        const adjust = s[axis] - at;
        if (Math.abs(adjust) > tolerance) continue;
        if (!found || Math.abs(adjust) < Math.abs(found.adjust)) {
          found = { adjust, from: { x: s.x, y: s.y } };
        }
      }
    }
    return found;
  }

  const x = best("x");
  const y = best("y");
  const guides: Guide[] = [];
  if (x) guides.push({ axis: "x", from: x.from });
  if (y) guides.push({ axis: "y", from: y.from });

  return {
    delta: {
      x: Math.round(rawDelta.x + (x?.adjust ?? 0)),
      y: Math.round(rawDelta.y + (y?.adjust ?? 0)),
    },
    guides,
  };
}
