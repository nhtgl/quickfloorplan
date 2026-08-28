import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { updateWall } from "./ops";
import { centrelineForMeasured, wallMeasuredLength, wallMeasuredSpan } from "./measure";
import type { MeasureFrom } from "./measure";
import type { Point, Project } from "./types";

const RECT: Point[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];

/** Closed rectangle on 4200 x 3100 centrelines, every wall 100 thick. */
function rect(measureFrom: MeasureFrom): Project {
  return { ...chainOfWalls(emptyProject("t"), RECT, true, 100), measureFrom };
}

const byLabel = (p: Project, l: string) => p.walls.find((w) => w.label === l)!;

describe("wallMeasuredSpan", () => {
  it("is the plain centreline when measuring from centres", () => {
    const p = rect("centre");
    expect(wallMeasuredSpan(p, byLabel(p, "A").id)).toEqual({ start: 0, end: 4200 });
    expect(wallMeasuredLength(p, byLabel(p, "A").id)).toBe(4200);
  });

  it("trims half a neighbour's thickness at each end when measuring inside", () => {
    const p = rect("inside");
    expect(wallMeasuredSpan(p, byLabel(p, "A").id)).toEqual({ start: 50, end: 4150 });
    expect(wallMeasuredLength(p, byLabel(p, "A").id)).toBe(4100);
    expect(wallMeasuredLength(p, byLabel(p, "B").id)).toBe(3000);
  });

  it("adds half a neighbour's thickness at each end when measuring outside", () => {
    const p = rect("outside");
    expect(wallMeasuredSpan(p, byLabel(p, "A").id)).toEqual({ start: -50, end: 4250 });
    expect(wallMeasuredLength(p, byLabel(p, "A").id)).toBe(4300);
  });

  it("uses each neighbour's own thickness, not this wall's", () => {
    let p = rect("inside");
    // Thicken only wall B, the neighbour at wall A's far end.
    p = updateWall(p, byLabel(p, "B").id, { offsets: { left: 150, right: 150 } });
    expect(wallMeasuredSpan(p, byLabel(p, "A").id)).toEqual({ start: 50, end: 4050 });
    expect(wallMeasuredLength(p, byLabel(p, "A").id)).toBe(4000);
  });

  it("gives the same answer whichever way the loop was drawn", () => {
    const reversed = {
      ...chainOfWalls(emptyProject("t"), [...RECT].reverse(), true, 100),
      measureFrom: "inside" as const,
    };
    const lengths = reversed.walls.map((w) => wallMeasuredLength(reversed, w.id)).sort();
    expect(lengths).toEqual([3000, 3000, 4100, 4100]);
  });

  it("falls back to the centreline for a wall in an open run, which has no inside", () => {
    const open = {
      ...chainOfWalls(emptyProject("t"), [{ x: 0, y: 0 }, { x: 4200, y: 0 }], false, 100),
      measureFrom: "inside" as const,
    };
    expect(wallMeasuredLength(open, open.walls[0].id)).toBe(4200);
  });

  it("handles a non-square corner", () => {
    // Equilateral-ish triangle: every turn is 120 degrees.
    const tri = {
      ...chainOfWalls(
        emptyProject("t"),
        [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 2000, y: 3464 },
        ],
        true,
        100,
      ),
      measureFrom: "inside" as const,
    };
    const inside = wallMeasuredLength(tri, tri.walls[0].id);
    // At a 120 degree turn each end loses more than half a thickness, but stays finite
    // and sane rather than blowing up the way a naive formula would.
    expect(inside).toBeLessThan(4000);
    expect(inside).toBeGreaterThan(3700);
  });
});

describe("centrelineForMeasured", () => {
  it("converts a typed inside length back to a centreline", () => {
    const p = rect("inside");
    expect(centrelineForMeasured(p, byLabel(p, "A").id, 4100)).toBe(4200);
    expect(centrelineForMeasured(p, byLabel(p, "A").id, 5000)).toBe(5100);
  });

  it("is the identity when measuring from centres", () => {
    const p = rect("centre");
    expect(centrelineForMeasured(p, byLabel(p, "A").id, 5000)).toBe(5000);
  });

  it("round-trips: typing what is displayed leaves the wall alone", async () => {
    const { setWallLength } = await import("./geometry");
    const p = rect("inside");
    const id = byLabel(p, "A").id;
    const shown = wallMeasuredLength(p, id);
    const next = setWallLength(p, id, centrelineForMeasured(p, id, shown));
    expect(wallMeasuredLength(next, id)).toBe(shown);
  });
});
