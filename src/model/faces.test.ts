import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { setWallFaceLength, squareWallEnds, updateWall } from "./ops";
import {
  allFaceCorners,
  wallFaceCorners,
  wallLinePoints,
  wallPolygon,
  wallSideNames,
  faceIsWorthDimensioning,
} from "./faces";
import {
  centrelineForSideLength,
  wallLengthForSide,
  wallMeasuredLength,
} from "./measure";
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
    expect(names.right).toBe("Outside");
  });

  it("names the two sides of a closed room inside and outside", () => {
    const p = rect();
    expect(wallSideNames(p, wall(p, "A"))).toEqual({ left: "Inside", right: "Outside" });
  });

  it("falls back to left and right for a wall enclosing nothing", () => {
    const open = chainOfWalls(
      emptyProject("t"),
      [{ x: 0, y: 0 }, { x: 4000, y: 0 }],
      false,
      100,
    );
    expect(wallSideNames(open, open.walls[0].id)).toEqual({ left: "Left", right: "Right" });
  });

  it("always gives the two sides different names", () => {
    const p = rect();
    const names = wallSideNames(p, wall(p, "A"));
    expect(names.left).not.toBe(names.right);
  });
});

describe("the length of each line", () => {
  it("measures each of the three lines", () => {
    const p = rect();
    const id = wall(p, "A");
    expect(wallLengthForSide(p, id, 0)).toBe(4200);
    expect(wallLengthForSide(p, id, 1)).toBe(4100);
    expect(wallLengthForSide(p, id, -1)).toBe(4300);
  });

  it("follows a neighbour's lopsided faces", () => {
    let p = rect();
    p = updateWall(p, wall(p, "B"), { offsets: { left: 200, right: 20 } });
    // The inner face loses the thick side, the outer face gains the thin one.
    expect(wallLengthForSide(p, wall(p, "A"), 1)).toBe(3950);
    expect(wallLengthForSide(p, wall(p, "A"), -1)).toBe(4270);
  });

  it("converts a typed face length back to a centreline", () => {
    const p = rect();
    const id = wall(p, "A");
    expect(centrelineForSideLength(p, id, 1, 4100)).toBe(4200);
    expect(centrelineForSideLength(p, id, 1, 4000)).toBe(4100);
    expect(centrelineForSideLength(p, id, -1, 4300)).toBe(4200);
  });

  it("round-trips: typing back what is displayed leaves the wall alone", async () => {
    const { setWallLength } = await import("./geometry");
    const p = rect();
    const id = wall(p, "A");
    for (const side of [1, 0, -1]) {
      const shown = wallLengthForSide(p, id, side);
      const next = setWallLength(p, id, centrelineForSideLength(p, id, side, shown));
      expect(wallLengthForSide(next, id, side)).toBe(shown);
    }
  });

  it("moves all three lines together, keeping the gaps between them", async () => {
    const { setWallLength } = await import("./geometry");
    const p = rect();
    const id = wall(p, "A");
    const gaps = [
      wallLengthForSide(p, id, 0) - wallLengthForSide(p, id, 1),
      wallLengthForSide(p, id, -1) - wallLengthForSide(p, id, 0),
    ];

    const next = setWallLength(p, id, centrelineForSideLength(p, id, 1, 3000));
    expect(wallLengthForSide(next, id, 1)).toBe(3000);
    // The other two followed by exactly the same amount.
    expect([
      wallLengthForSide(next, id, 0) - wallLengthForSide(next, id, 1),
      wallLengthForSide(next, id, -1) - wallLengthForSide(next, id, 0),
    ]).toEqual(gaps);
  });
});

describe("faces of different lengths", () => {
  it("changes only the face that was typed", () => {
    let p = rect();
    const id = wall(p, "A");
    const before = [1, 0, -1].map((s) => wallLengthForSide(p, id, s));

    p = setWallFaceLength(p, id, -1, 4500);

    expect(wallLengthForSide(p, id, -1)).toBe(4500);
    // The centreline and the inner face are exactly where they were.
    expect(wallLengthForSide(p, id, 0)).toBe(before[1]);
    expect(wallLengthForSide(p, id, 1)).toBe(before[0]);
  });

  it("does not move the wall, so nothing beyond it shifts", () => {
    let p = rect();
    const nodes = p.nodes.map((n) => ({ ...n }));
    p = setWallFaceLength(p, wall(p, "A"), -1, 4500);
    expect(p.nodes).toEqual(nodes);
  });

  it("slants the far end, leaving the near end where it was", () => {
    let p = rect();
    const id = wall(p, "A");
    const before = wallLinePoints(p, id, "right");
    p = setWallFaceLength(p, id, -1, 4500);
    const after = wallLinePoints(p, id, "right");

    expect(after.from).toEqual(before.from);
    expect(after.to.x).toBe(before.to.x + 200);
  });

  it("lets both faces differ from each other and from the centreline", () => {
    let p = rect();
    const id = wall(p, "A");
    p = setWallFaceLength(p, id, 1, 3800);
    p = setWallFaceLength(p, id, -1, 4600);
    expect([1, 0, -1].map((s) => wallLengthForSide(p, id, s))).toEqual([3800, 4200, 4600]);
  });

  it("gives the wall four corners that are no longer a rectangle", () => {
    let p = rect();
    const id = wall(p, "A");
    p = setWallFaceLength(p, id, -1, 4600);
    const poly = wallPolygon(p, id);
    expect(poly).toHaveLength(4);
    // The two faces now end at different distances along the wall.
    expect(poly[1].x).not.toBe(poly[2].x);
  });

  it("squares the ends again on request", () => {
    let p = rect();
    const id = wall(p, "A");
    const before = [1, 0, -1].map((s) => wallLengthForSide(p, id, s));
    p = setWallFaceLength(p, id, -1, 4600);
    p = squareWallEnds(p, id);
    expect([1, 0, -1].map((s) => wallLengthForSide(p, id, s))).toEqual(before);
  });

  it("survives a save and reload", async () => {
    const { serialize, deserialize } = await import("../file/serialize");
    let p = rect();
    p = setWallFaceLength(p, wall(p, "A"), -1, 4600);
    const result = deserialize(serialize(p));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(wallLengthForSide(result.project, wall(result.project, "A"), -1)).toBe(4600);
    }
  });
});

describe("which faces are worth dimensioning", () => {
  it("dimensions a face with a room against it", () => {
    const p: Project = {
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
    expect(faceIsWorthDimensioning(p, wall(p, "A"), 1)).toBe(true);
  });

  it("dimensions a bare face when it is the outside of the building", () => {
    const p = rect();
    expect(faceIsWorthDimensioning(p, wall(p, "A"), -1)).toBe(true);
  });

  it("skips a bare face pressed against another wall", () => {
    // A second room sharing the first's right-hand wall line.
    let p = rect();
    p = chainOfWalls(
      p,
      [
        { x: 4200, y: 0 },
        { x: 6200, y: 0 },
        { x: 6200, y: 3100 },
        { x: 4200, y: 3100 },
      ],
      true,
      100,
    );
    const shared = p.walls.find(
      (w) => w.label === "E" || w.label === "H",
    );
    expect(shared).toBeDefined();
    // Whichever of the two back-to-back faces has no room is not worth a second string.
    const sides = [1, -1].map((side) => faceIsWorthDimensioning(p, wall(p, "B"), side));
    expect(sides).toContain(false);
  });
});
