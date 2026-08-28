import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { updateWall } from "./ops";
import { allFaceCorners, wallFaceCorners, wallLinePoints, wallSideNames } from "./faces";
import { wallMeasuredLength } from "./measure";
import { wallThickness } from "./walls";
import type { Point, Project } from "./types";

const RECT: Point[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];

/** Closed rectangle on 4200 x 3100 centrelines, walls 100 thick. */
const rect = (): Project => chainOfWalls(emptyProject("t"), RECT, true, 100);
const wall = (p: Project, label: string) => p.walls.find((w) => w.label === label)!.id;

describe("wallLinePoints", () => {
  it("returns the centreline untouched", () => {
    const p = rect();
    expect(wallLinePoints(p, wall(p, "A"), "centre")).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 4200, y: 0 },
    });
  });

  it("puts the inner face half a thickness in, trimmed at both corners", () => {
    const p = rect();
    // Walls run clockwise on screen, so the left-hand side is the inside.
    expect(wallLinePoints(p, wall(p, "A"), "left")).toEqual({
      from: { x: 50, y: 50 },
      to: { x: 4150, y: 50 },
    });
  });

  it("puts the outer face half a thickness out, extended at both corners", () => {
    const p = rect();
    expect(wallLinePoints(p, wall(p, "A"), "right")).toEqual({
      from: { x: -50, y: -50 },
      to: { x: 4250, y: -50 },
    });
  });

  it("gives the inner faces of a room its true clear dimensions", () => {
    const p = rect();
    const a = wallLinePoints(p, wall(p, "A"), "left");
    const b = wallLinePoints(p, wall(p, "B"), "left");
    expect(a.to.x - a.from.x).toBe(4100);
    expect(b.to.y - b.from.y).toBe(3000);
  });

  it("mitres against the neighbour's thickness, not its own", () => {
    let p = rect();
    p = updateWall(p, wall(p, "B"), { offsets: { left: 150, right: 150 } });
    // Wall A's inner face now stops 150 short at the thick wall's end.
    expect(wallLinePoints(p, wall(p, "A"), "left").to.x).toBe(4050);
  });

  it("meets exactly where two walls' faces on the same side join", () => {
    const p = rect();
    const a = wallLinePoints(p, wall(p, "A"), "left");
    const b = wallLinePoints(p, wall(p, "B"), "left");
    expect(a.to).toEqual(b.from);
  });

  it("leaves a face square at the loose end of an open run", () => {
    const open = chainOfWalls(
      emptyProject("t"),
      [{ x: 0, y: 0 }, { x: 4000, y: 0 }],
      false,
      100,
    );
    expect(wallLinePoints(open, open.walls[0].id, "left")).toEqual({
      from: { x: 0, y: 50 },
      to: { x: 4000, y: 50 },
    });
  });
});

describe("face corners", () => {
  it("gives four corners per wall: both ends of both faces", () => {
    const p = rect();
    expect(wallFaceCorners(p, wall(p, "A"))).toHaveLength(4);
    expect(allFaceCorners(p)).toHaveLength(16);
  });

  it("says which wall and which face each corner came from", () => {
    const p = rect();
    const corners = wallFaceCorners(p, wall(p, "A"));
    expect(corners.every((c) => c.wallId === wall(p, "A"))).toBe(true);
    expect(new Set(corners.map((c) => c.line))).toEqual(new Set(["left", "right"]));
  });

  it("includes the inside corners a neighbouring room would be measured from", () => {
    const p = rect();
    const inside = allFaceCorners(p)
      .filter((c) => c.line === "left")
      .map((c) => `${c.point.x},${c.point.y}`);
    expect(inside).toContain("50,50");
    expect(inside).toContain("4150,50");
    expect(inside).toContain("4150,3050");
    expect(inside).toContain("50,3050");
  });
});

describe("faces that move on their own", () => {
  it("moves only the face that was edited", () => {
    let p = rect();
    const before = wallLinePoints(p, wall(p, "A"), "right");
    p = updateWall(p, wall(p, "A"), { offsets: { left: 250, right: 50 } });

    // The inner face moved out to 250 from the centreline; the outer face did not budge.
    expect(wallLinePoints(p, wall(p, "A"), "left").from.y).toBe(250);
    expect(wallLinePoints(p, wall(p, "A"), "right").from.y).toBe(before.from.y);
  });

  it("changes the room's clear dimension by exactly what was typed", () => {
    let p: Project = { ...rect(), measureFrom: "inside" };
    const before = wallMeasuredLength(p, wall(p, "B"));
    // Thicken wall A's inner face by 100; wall B runs between A and C, so it loses 100.
    p = updateWall(p, wall(p, "A"), { offsets: { left: 150, right: 50 } });
    expect(wallMeasuredLength(p, wall(p, "B"))).toBe(before - 100);
  });

  it("leaves the far side's room untouched when one face moves", () => {
    let p: Project = { ...rect(), measureFrom: "outside" };
    const before = wallMeasuredLength(p, wall(p, "B"));
    p = updateWall(p, wall(p, "A"), { offsets: { left: 150, right: 50 } });
    // The outside is measured to the right-hand faces, which did not move.
    expect(wallMeasuredLength(p, wall(p, "B"))).toBe(before);
  });

  it("reports the thickness as the two faces together", () => {
    let p = rect();
    p = updateWall(p, wall(p, "A"), { offsets: { left: 40, right: 160 } });
    expect(wallThickness(p.walls.find((w) => w.id === wall(p, "A"))!)).toBe(200);
  });

  it("still mitres correctly against a neighbour with lopsided faces", () => {
    let p = rect();
    p = updateWall(p, wall(p, "B"), { offsets: { left: 200, right: 20 } });
    // Wall A's inner face stops where wall B's inner face reaches it, 200 short.
    expect(wallLinePoints(p, wall(p, "A"), "left").to.x).toBe(4000);
    // The outer faces meet on their own terms, 20 beyond.
    expect(wallLinePoints(p, wall(p, "A"), "right").to.x).toBe(4220);
  });
});

describe("wallSideNames", () => {
  it("names each side after the room against it", () => {
    const p = {
      ...rect(),
      rooms: [
        {
          id: "r1",
          name: "Kitchen",
          tint: "#eee",
          polygon: [
            { x: 50, y: 50 },
            { x: 4150, y: 50 },
            { x: 4150, y: 3050 },
            { x: 50, y: 3050 },
          ],
        },
      ],
    };
    const names = wallSideNames(p, wall(p, "A"));
    expect(names.left).toBe("Kitchen");
    expect(names.right).toBe("Other side");
  });

  it("falls back when there is no room either side", () => {
    const p = rect();
    expect(wallSideNames(p, wall(p, "A"))).toEqual({
      left: "Other side",
      right: "Other side",
    });
  });
});
