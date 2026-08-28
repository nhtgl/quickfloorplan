import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "../model/factory";
import { resolveSnap } from "./snapping";
import type { Project } from "../model/types";

/** Corners at (0,0), (4000,0), (4000,3000), (0,3000). */
function room(): Project {
  return chainOfWalls(
    emptyProject("t"),
    [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ],
    true,
  );
}

// 10mm per pixel, so the magnet reaches 120mm and alignment reaches 80mm.
const base = { project: room(), origin: null, freeAngle: false, draftPoints: [], mmPerPx: 10 };

describe("resolveSnap", () => {
  it("lands on an existing corner when close enough, with no guides", () => {
    const r = resolveSnap({ ...base, raw: { x: 4050, y: 40 } });
    expect(r.point).toEqual({ x: 4000, y: 0 });
    expect(r.onCorner).toBe(true);
    expect(r.guides).toEqual([]);
  });

  it("lines up on x with a corner across the room and says which one", () => {
    const r = resolveSnap({ ...base, raw: { x: 4030, y: 2000 } });
    expect(r.point).toEqual({ x: 4000, y: 2000 });
    expect(r.guides).toEqual([{ axis: "x", from: { x: 4000, y: 0 } }]);
  });

  it("lines up on y", () => {
    const r = resolveSnap({ ...base, raw: { x: 2000, y: 3040 } });
    expect(r.point).toEqual({ x: 2000, y: 3000 });
    expect(r.guides.map((g) => g.axis)).toEqual(["y"]);
  });

  it("lines up on both axes at once, landing on the intersection", () => {
    // In a bare rectangle every x/y intersection is itself a corner, so the magnet would
    // win. A corner off to one side gives an intersection that is not a corner.
    const withOutrigger = chainOfWalls(
      room(),
      [
        { x: 1500, y: 8000 },
        { x: 1500, y: 9000 },
      ],
      false,
    );
    const r = resolveSnap({ ...base, project: withOutrigger, raw: { x: 1530, y: 3040 } });
    expect(r.point).toEqual({ x: 1500, y: 3000 });
    expect(r.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
  });

  it("reports no guide when nothing is within tolerance", () => {
    const r = resolveSnap({ ...base, raw: { x: 2000, y: 1500 } });
    expect(r.guides).toEqual([]);
    expect(r.point).toEqual({ x: 2000, y: 1500 });
  });

  it("aligns to a corner of the run being drawn, not only committed ones", () => {
    const r = resolveSnap({
      ...base,
      project: emptyProject("t"),
      draftPoints: [{ x: 1000, y: 1000 }],
      raw: { x: 1040, y: 5000 },
    });
    expect(r.point).toEqual({ x: 1000, y: 5000 });
    expect(r.guides).toEqual([{ axis: "x", from: { x: 1000, y: 1000 } }]);
  });

  it("falls back to the 15 degree lock when nothing lines up", () => {
    const r = resolveSnap({
      ...base,
      project: emptyProject("t"),
      origin: { x: 0, y: 0 },
      raw: { x: 1000, y: 500 },
    });
    // atan2(500,1000) is 26.6 degrees, which locks to 30.
    const deg = (Math.atan2(r.point.y, r.point.x) * 180) / Math.PI;
    // Points are rounded to whole millimetres, so the locked angle is within a rounding of 30.
    expect(deg).toBeCloseTo(30, 1);
  });

  it("holding Alt turns off both alignment and the angle lock", () => {
    const r = resolveSnap({
      ...base,
      origin: { x: 0, y: 0 },
      freeAngle: true,
      raw: { x: 4030, y: 2000 },
    });
    expect(r.point).toEqual({ x: 4030, y: 2000 });
    expect(r.guides).toEqual([]);
  });

  it("scales tolerance with zoom so the feel is the same at any scale", () => {
    // At 1mm per pixel the same 30mm miss is 30 pixels away, far outside tolerance.
    const r = resolveSnap({ ...base, mmPerPx: 1, raw: { x: 4030, y: 2000 } });
    expect(r.guides).toEqual([]);
  });

  it("prefers the nearest corner when several line up on the same axis", () => {
    const p = chainOfWalls(
      emptyProject("t"),
      [
        { x: 1000, y: 0 },
        { x: 1010, y: 2000 },
      ],
      false,
    );
    const r = resolveSnap({ ...base, project: p, raw: { x: 1008, y: 5000 } });
    expect(r.point.x).toBe(1010);
  });
});
