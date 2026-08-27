import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import {
  chainFrom,
  loopGap,
  nodeById,
  setWallAngleDeg,
  setWallLength,
  wallAngleDeg,
  wallLength,
} from "./geometry";
import type { Project } from "./types";

/** Closed 4200 x 3100 rectangle, walls A (top), B (right), C (bottom), D (left). */
function rect(): Project {
  return chainOfWalls(
    emptyProject("t"),
    [
      { x: 0, y: 0 },
      { x: 4200, y: 0 },
      { x: 4200, y: 3100 },
      { x: 0, y: 3100 },
    ],
    true,
  );
}

const byLabel = (p: Project, label: string) => p.walls.find((w) => w.label === label)!;

describe("wallLength", () => {
  it("measures the centreline", () => {
    const p = rect();
    expect(wallLength(p, byLabel(p, "A").id)).toBe(4200);
    expect(wallLength(p, byLabel(p, "B").id)).toBe(3100);
  });
});

describe("wallAngleDeg", () => {
  it("is null for the first wall in an open chain", () => {
    const p = chainOfWalls(emptyProject("t"), [{ x: 0, y: 0 }, { x: 1000, y: 0 }], false);
    expect(wallAngleDeg(p, p.walls[0].id)).toBeNull();
  });

  it("reports 90 at each corner of a rectangle", () => {
    const p = rect();
    for (const label of ["B", "C", "D"]) {
      expect(wallAngleDeg(p, byLabel(p, label).id)).toBeCloseTo(90, 6);
    }
  });

  it("reports 0 for collinear walls", () => {
    const p = chainOfWalls(
      emptyProject("t"),
      [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }],
      false,
    );
    expect(wallAngleDeg(p, p.walls[1].id)).toBeCloseTo(0, 6);
  });

  it("returns null rather than NaN for a zero-length wall", () => {
    let p = chainOfWalls(
      emptyProject("t"),
      [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 0 }],
      false,
    );
    expect(wallAngleDeg(p, p.walls[1].id)).toBeNull();
    p = { ...p };
    expect(Number.isNaN(wallAngleDeg(p, p.walls[1].id) as number)).toBe(false);
  });
});

describe("chainFrom", () => {
  it("walks downstream walls in order", () => {
    const p = rect();
    const labels = chainFrom(p, byLabel(p, "A").id).map(
      (id) => p.walls.find((w) => w.id === id)!.label,
    );
    expect(labels).toEqual(["B", "C", "D"]);
  });

  it("stops at the start when the loop closes rather than looping forever", () => {
    const p = rect();
    expect(chainFrom(p, byLabel(p, "C").id).length).toBeLessThanOrEqual(3);
  });
});

describe("setWallLength", () => {
  it("moves the far node and everything downstream of it", () => {
    const p = rect();
    const a = byLabel(p, "A");
    const next = setWallLength(p, a.id, 5000);
    expect(wallLength(next, a.id)).toBe(5000);
    // Node a of wall A is the chain origin and must not move.
    expect(nodeById(next, a.a)).toMatchObject({ x: 0, y: 0 });
    // Downstream corners shifted by the same 800mm.
    expect(nodeById(next, a.b)).toMatchObject({ x: 5000, y: 0 });
    expect(nodeById(next, byLabel(next, "B").b)).toMatchObject({ x: 5000, y: 3100 });
  });

  it("preserves the lengths of downstream walls", () => {
    const p = rect();
    const next = setWallLength(p, byLabel(p, "A").id, 5000);
    expect(wallLength(next, byLabel(next, "B").id)).toBe(3100);
    expect(wallLength(next, byLabel(next, "C").id)).toBe(4200);
  });
});

describe("setWallAngleDeg", () => {
  it("rotates the downstream chain about the shared corner", () => {
    const p = rect();
    const b = byLabel(p, "B");
    const next = setWallAngleDeg(p, b.id, 45);
    expect(wallAngleDeg(next, b.id)).toBeCloseTo(45, 4);
    // The corner itself is the pivot and stays put.
    expect(nodeById(next, b.a)).toMatchObject({ x: 4200, y: 0 });
    // Wall B keeps its length through the rotation.
    expect(wallLength(next, b.id)).toBe(3100);
  });
});

describe("loopGap", () => {
  it("is zero for a closed rectangle", () => {
    const p = rect();
    expect(loopGap(p, byLabel(p, "A").id)).toBe(0);
  });

  it("reports the distance the loop was opened by after a length edit", () => {
    const p = rect();
    const next = setWallLength(p, byLabel(p, "A").id, 5000);
    expect(loopGap(next, byLabel(next, "A").id)).toBe(800);
  });

  it("is zero for an open chain, which cannot be out of true", () => {
    const p = chainOfWalls(emptyProject("t"), [{ x: 0, y: 0 }, { x: 1000, y: 0 }], false);
    expect(loopGap(p, p.walls[0].id)).toBe(0);
  });
});
