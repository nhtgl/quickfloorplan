import { describe, it, expect } from "vitest";
import { emptyProject } from "./factory";
import { buildFromMeasurements, parseMeasurements } from "./fromMeasurements";
import { loopNodeIds, loopWallIds, moveLoop, roomsInLoop } from "./loops";
import { roomArea } from "./rooms";
import { nodeById } from "./geometry";
import type { Project } from "./types";

/** Two rooms built from typed sizes, the second placed clear of the first. */
function twoRooms(): Project {
  const parse = (t: string) => {
    const r = parseMeasurements(t, "cm", false);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const blank: Project = { ...emptyProject("t"), units: "cm", measureFrom: "centre" };
  const one = buildFromMeasurements(blank, parse("400,90,300,90,400,90,300,90"), {
    thickness: 100,
    name: "One",
  });
  return buildFromMeasurements(one.project, parse("250,90,200,90,250,90,200,90"), {
    thickness: 100,
    name: "Two",
  }).project;
}

const wallsOf = (p: Project, label: string) => p.walls.find((w) => w.label === label)!;

describe("loop membership", () => {
  it("finds the four walls and four corners of one room", () => {
    const p = twoRooms();
    expect(loopWallIds(p, wallsOf(p, "A").id)).toHaveLength(4);
    expect(loopNodeIds(p, wallsOf(p, "A").id)).toHaveLength(4);
  });

  it("does not stray into the other room", () => {
    const p = twoRooms();
    const first = new Set(loopWallIds(p, wallsOf(p, "A").id));
    expect(first.has(wallsOf(p, "E").id)).toBe(false);
  });

  it("claims the room drawn inside it, and only that one", () => {
    const p = twoRooms();
    const names = roomsInLoop(p, wallsOf(p, "A").id).map(
      (id) => p.rooms.find((r) => r.id === id)!.name,
    );
    expect(names).toEqual(["One"]);
  });
});

describe("moveLoop", () => {
  it("shifts every corner of the run by the same amount", () => {
    const p = twoRooms();
    const wallId = wallsOf(p, "E").id;
    const before = loopNodeIds(p, wallId).map((id) => ({ ...nodeById(p, id) }));
    const after = moveLoop(p, wallId, -1500, 400);

    for (const n of before) {
      const moved = nodeById(after, n.id);
      expect(moved.x).toBe(n.x - 1500);
      expect(moved.y).toBe(n.y + 400);
    }
  });

  it("leaves the other room exactly where it was", () => {
    const p = twoRooms();
    const otherIds = loopNodeIds(p, wallsOf(p, "A").id);
    const before = otherIds.map((id) => ({ ...nodeById(p, id) }));
    const after = moveLoop(p, wallsOf(p, "E").id, -1500, 400);
    for (const n of before) expect(nodeById(after, n.id)).toMatchObject({ x: n.x, y: n.y });
  });

  it("carries the room's tint and label along with its walls", () => {
    const p = twoRooms();
    const two = p.rooms.find((r) => r.name === "Two")!;
    const areaBefore = roomArea(two);
    const after = moveLoop(p, wallsOf(p, "E").id, -1500, 400);
    const moved = after.rooms.find((r) => r.name === "Two")!;

    expect(moved.polygon[0].x).toBe(two.polygon[0].x - 1500);
    expect(moved.polygon[0].y).toBe(two.polygon[0].y + 400);
    // Moving a room must not change its size.
    expect(roomArea(moved)).toBe(areaBefore);
  });

  it("leaves the untouched room's outline alone", () => {
    const p = twoRooms();
    const one = p.rooms.find((r) => r.name === "One")!;
    const after = moveLoop(p, wallsOf(p, "E").id, -1500, 400);
    expect(after.rooms.find((r) => r.name === "One")!.polygon).toEqual(one.polygon);
  });

  it("is a no-op for a zero move", () => {
    const p = twoRooms();
    expect(moveLoop(p, wallsOf(p, "A").id, 0, 0)).toBe(p);
  });
});
