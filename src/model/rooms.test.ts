import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { newId } from "./ids";
import {
  polygonSelfIntersects,
  roomArea,
  roomsForWall,
  roomsOverlap,
  wallsForRoom,
} from "./rooms";
import type { Point, Project, Room } from "./types";

const room = (name: string, polygon: Point[]): Room => ({
  id: newId("r"),
  name,
  polygon,
  tint: "#eee",
});

const RECT: Point[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];

describe("roomArea", () => {
  it("measures a rectangle", () => {
    expect(roomArea(room("r", RECT))).toBe(13_020_000);
  });

  it("does not depend on winding direction", () => {
    expect(roomArea(room("r", [...RECT].reverse()))).toBe(13_020_000);
  });

  it("measures a concave L-shape", () => {
    // 4000x4000 square with a 2000x2000 bite taken out of the bottom-right.
    const l: Point[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(roomArea(room("l", l))).toBe(12_000_000);
  });

  it("is zero for a degenerate polygon", () => {
    expect(roomArea(room("r", [{ x: 0, y: 0 }, { x: 100, y: 0 }]))).toBe(0);
  });
});

describe("polygonSelfIntersects", () => {
  it("is false for a simple rectangle", () => {
    expect(polygonSelfIntersects(RECT)).toBe(false);
  });

  it("is true for a bowtie", () => {
    const bowtie: Point[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 4000 },
      { x: 4000, y: 0 },
      { x: 0, y: 4000 },
    ];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });
});

describe("roomsOverlap", () => {
  it("is false for rooms sharing only an edge", () => {
    const hall = room("Hall", [
      { x: 0, y: 0 },
      { x: 1500, y: 0 },
      { x: 1500, y: 3100 },
      { x: 0, y: 3100 },
    ]);
    const dining = room("Dining", [
      { x: 1500, y: 0 },
      { x: 4200, y: 0 },
      { x: 4200, y: 3100 },
      { x: 1500, y: 3100 },
    ]);
    expect(roomsOverlap(hall, dining)).toBe(false);
  });

  it("is true for rooms that genuinely overlap", () => {
    const a = room("A", RECT);
    const b = room("B", [
      { x: 2000, y: 1000 },
      { x: 6000, y: 1000 },
      { x: 6000, y: 5000 },
      { x: 2000, y: 5000 },
    ]);
    expect(roomsOverlap(a, b)).toBe(true);
  });
});

/** Closed 4200x3100 rectangle: A top, B right, C bottom, D left. */
function rectProject(): Project {
  return chainOfWalls(emptyProject("t"), RECT, true);
}

const byLabel = (p: Project, label: string) => p.walls.find((w) => w.label === label)!;

describe("room to wall association", () => {
  it("matches a wall lying along a room edge", () => {
    const p = { ...rectProject() };
    const r = room("Whole", RECT);
    p.rooms = [r];
    expect(wallsForRoom(p, r.id).map((id) => p.walls.find((w) => w.id === id)!.label).sort())
      .toEqual(["A", "B", "C", "D"]);
  });

  it("does not match a wall that only clips the room's corner", () => {
    const p = { ...rectProject() };
    // A small room tucked in the top-left, touching wall A only near its start.
    const r = room("Nook", [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ]);
    p.rooms = [r];
    const labels = wallsForRoom(p, r.id).map((id) => p.walls.find((w) => w.id === id)!.label);
    expect(labels).not.toContain("A");
  });

  it("matches both rooms for a wall that borders two", () => {
    const p = { ...rectProject() };
    // Two rooms split left/right; wall A (the top wall) spans both.
    const hall = room("Hall", [
      { x: 0, y: 0 },
      { x: 1500, y: 0 },
      { x: 1500, y: 3100 },
      { x: 0, y: 3100 },
    ]);
    const dining = room("Dining", [
      { x: 1500, y: 0 },
      { x: 4200, y: 0 },
      { x: 4200, y: 3100 },
      { x: 1500, y: 3100 },
    ]);
    p.rooms = [hall, dining];
    const names = roomsForWall(p, byLabel(p, "A").id).map(
      (id) => p.rooms.find((r) => r.id === id)!.name,
    );
    expect(names).toEqual(["Hall", "Dining"]);
  });

  it("returns no rooms for a wall far from every room", () => {
    const p = { ...rectProject() };
    p.rooms = [
      room("Far", [
        { x: 50_000, y: 50_000 },
        { x: 52_000, y: 50_000 },
        { x: 52_000, y: 52_000 },
        { x: 50_000, y: 52_000 },
      ]),
    ];
    expect(roomsForWall(p, byLabel(p, "A").id)).toEqual([]);
  });
});
