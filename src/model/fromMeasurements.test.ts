import { describe, it, expect } from "vitest";
import { emptyProject } from "./factory";
import { buildFromMeasurements, parseMeasurements } from "./fromMeasurements";
import { wallMeasuredLength } from "./measure";
import { roomArea } from "./rooms";
import { wallLength } from "./geometry";
import type { MeasureFrom } from "./measure";
import type { Project } from "./types";

const parse = (t: string, rightAngles = false) => {
  const r = parseMeasurements(t, "cm", rightAngles);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

function blank(measureFrom: MeasureFrom): Project {
  return { ...emptyProject("t"), units: "cm", measureFrom };
}

describe("parseMeasurements", () => {
  it("reads alternating length and turn", () => {
    expect(parse("250,90,100,90,250,90,100,90")).toEqual({
      lengths: [2500, 1000, 2500, 1000],
      angles: [90, 90, 90, 90],
    });
  });

  it("accepts spaces and semicolons as well as commas", () => {
    expect(parse("250 90; 100,90 250 90 100 90").lengths).toEqual([2500, 1000, 2500, 1000]);
  });

  it("fills in a missing final turn", () => {
    expect(parse("250,90,100,90,250,90,100")).toEqual({
      lengths: [2500, 1000, 2500, 1000],
      angles: [90, 90, 90, 90],
    });
  });

  it("reads every number as a length when told corners are square", () => {
    expect(parse("250,100,250,100", true)).toEqual({
      lengths: [2500, 1000, 2500, 1000],
      angles: [90, 90, 90, 90],
    });
  });

  it("keeps negative turns, which is how a room turns back on itself", () => {
    expect(parse("250,90,100,-90,250,90").angles).toEqual([90, -90, 90]);
  });

  it("rejects a non-number, naming it", () => {
    const r = parseMeasurements("250,90,abc", "cm", false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("abc");
  });

  it("rejects too few walls to enclose anything", () => {
    expect(parseMeasurements("250,90,100", "cm", false).ok).toBe(false);
  });

  it("rejects a zero or negative length", () => {
    expect(parseMeasurements("250,90,0,90,100,90,100", "cm", false).ok).toBe(false);
  });

  it("reads metres when the project is in metres", () => {
    const r = parseMeasurements("2.5,90,1,90,2.5,90,1,90", "m", false);
    expect(r.ok && r.value.lengths).toEqual([2500, 1000, 2500, 1000]);
  });
});

describe("buildFromMeasurements", () => {
  const input = () => parse("250,90,100,90,250,90,100,90");

  it("closes the loop and makes one wall per length", () => {
    const r = buildFromMeasurements(blank("centre"), input(), {
      thickness: 100,
      name: "Hall",
    });
    expect(r.project.walls).toHaveLength(4);
    expect(r.project.nodes).toHaveLength(4);
    expect(r.gap).toBe(0);
  });

  it("takes typed sizes as centrelines when the project measures centrelines", () => {
    const r = buildFromMeasurements(blank("centre"), input(), {
      thickness: 100,
      name: "Hall",
    });
    const lengths = r.project.walls.map((w) => wallLength(r.project, w.id));
    expect(lengths).toEqual([2500, 1000, 2500, 1000]);
  });

  it("makes the inside faces match the typed sizes when measuring inside", () => {
    const r = buildFromMeasurements(blank("inside"), input(), {
      thickness: 100,
      name: "Hall",
    });
    const measured = r.project.walls.map((w) => wallMeasuredLength(r.project, w.id));
    expect(measured).toEqual([2500, 1000, 2500, 1000]);
    // The centrelines had to grow by a wall thickness to get there.
    expect(wallLength(r.project, r.project.walls[0].id)).toBe(2600);
  });

  it("makes the outside faces match when measuring outside", () => {
    const r = buildFromMeasurements(blank("outside"), input(), {
      thickness: 100,
      name: "Hall",
    });
    const measured = r.project.walls.map((w) => wallMeasuredLength(r.project, w.id));
    expect(measured).toEqual([2500, 1000, 2500, 1000]);
    expect(wallLength(r.project, r.project.walls[0].id)).toBe(2400);
  });

  it("adds a named room whose area matches the typed inside sizes", () => {
    const r = buildFromMeasurements(blank("inside"), input(), {
      thickness: 100,
      name: "Hall",
    });
    const room = r.project.rooms.find((x) => x.id === r.roomId)!;
    expect(room.name).toBe("Hall");
    // 2.50m x 1.00m of clear floor.
    expect(roomArea(room)).toBe(2_500_000);
  });

  it("builds an L-shaped room from turns that double back", () => {
    const l = parse("400,90,400,90,200,90,200,-90,200,90,200");
    const r = buildFromMeasurements(blank("centre"), l, { thickness: 100, name: "L" });
    expect(r.project.walls).toHaveLength(6);
    expect(r.gap).toBe(0);
  });

  it("reports the gap and adds no room when the numbers do not close", () => {
    const bad = parse("250,90,100,90,900,90,100,90");
    const r = buildFromMeasurements(blank("centre"), bad, { thickness: 100, name: "X" });
    expect(r.gap).toBeGreaterThan(1000);
    expect(r.roomId).toBeNull();
    // The walls are still added, so the drawing shows what the numbers actually describe.
    expect(r.project.walls).toHaveLength(4);
  });

  it("places a second room clear of the first instead of on top of it", () => {
    const first = buildFromMeasurements(blank("centre"), input(), {
      thickness: 100,
      name: "One",
    });
    const second = buildFromMeasurements(first.project, input(), {
      thickness: 100,
      name: "Two",
    });
    const firstMaxX = Math.max(...first.project.nodes.map((n) => n.x));
    const newNodes = second.project.nodes.slice(first.project.nodes.length);
    expect(Math.min(...newNodes.map((n) => n.x))).toBeGreaterThan(firstMaxX);
  });

  it("keeps existing walls and rooms untouched", () => {
    const first = buildFromMeasurements(blank("centre"), input(), {
      thickness: 100,
      name: "One",
    });
    const second = buildFromMeasurements(first.project, input(), {
      thickness: 100,
      name: "Two",
    });
    expect(second.project.walls).toHaveLength(8);
    expect(second.project.rooms).toHaveLength(2);
    expect(second.project.walls.map((w) => w.label)).toEqual([
      "A", "B", "C", "D", "E", "F", "G", "H",
    ]);
  });
});
