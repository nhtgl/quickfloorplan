import { describe, it, expect } from "vitest";
import { emptyProject } from "./factory";
import { buildFromMeasurements, parseMeasurements } from "./fromMeasurements";
import { loopWallIds, moveLoop } from "./loops";
import { wallEnds } from "./geometry";
import { addOpeningAtOffset } from "./ops";
import { sharedSpan, wallOpeningViews } from "./sharedOpenings";
import type { Project } from "./types";

const parse = (t: string) => {
  const r = parseMeasurements(t, "cm", false);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const wall = (p: Project, label: string) => p.walls.find((w) => w.label === label)!;

/** Two rooms, the second sitting exactly against the first's right-hand wall. */
function pushedTogether(): Project {
  const blank: Project = { ...emptyProject("t"), units: "cm", measureFrom: "centre" };
  const one = buildFromMeasurements(blank, parse("400,90,300,90,400,90,300,90"), {
    thickness: 100,
    name: "One",
  });
  const two = buildFromMeasurements(one.project, parse("250,90,300,90,250,90,300,90"), {
    thickness: 100,
    name: "Two",
  });
  let p = two.project;

  // Wall B is the first room's right-hand wall; slide the second room onto it.
  const rightX = Math.max(
    ...loopWallIds(p, wall(p, "A").id).map((id) => p.nodes.find((n) => n.id === p.walls.find((w) => w.id === id)!.a)!.x),
  );
  const movedIds = loopWallIds(p, wall(p, "E").id);
  const leftX = Math.min(
    ...movedIds.map((id) => p.nodes.find((n) => n.id === p.walls.find((w) => w.id === id)!.a)!.x),
  );
  p = moveLoop(p, wall(p, "E").id, rightX - leftX, 0);
  return p;
}

/** The wall of the second room that now lies on the first room's right-hand wall. */
function touchingWall(p: Project): string {
  const moved = loopWallIds(p, wall(p, "E").id);
  const found = moved.find((id) => sharedSpan(p, id, wall(p, "B").id));
  if (!found) throw new Error("expected one wall to be touching");
  return found;
}

describe("sharedSpan", () => {
  it("finds the stretch two coincident walls have in common", () => {
    const p = pushedTogether();
    const span = sharedSpan(p, touchingWall(p), wall(p, "B").id)!;
    expect(span.to - span.from).toBe(3000);
  });

  it("says the two walls run opposite ways, as adjacent rooms' walls do", () => {
    const p = pushedTogether();
    expect(sharedSpan(p, touchingWall(p), wall(p, "B").id)!.sameDirection).toBe(false);
  });

  it("is null for walls that are merely parallel and apart", () => {
    const p = pushedTogether();
    expect(sharedSpan(p, wall(p, "A").id, wall(p, "C").id)).toBeNull();
  });

  it("is null for walls that meet at a corner rather than lie on each other", () => {
    const p = pushedTogether();
    expect(sharedSpan(p, wall(p, "A").id, wall(p, "B").id)).toBeNull();
  });
});

describe("wallOpeningViews", () => {
  function withDoorOnB(): Project {
    const p = pushedTogether();
    return addOpeningAtOffset(p, wall(p, "B").id, 1200, "door").project;
  }

  it("shows the door on the wall it belongs to", () => {
    const p = withDoorOnB();
    const views = wallOpeningViews(p, wall(p, "B").id);
    expect(views).toHaveLength(1);
    expect(views[0].own).toBe(true);
    expect(views[0].offset).toBe(p.openings[0].offset);
  });

  it("shows the same door on the wall lying against it", () => {
    const p = withDoorOnB();
    const views = wallOpeningViews(p, touchingWall(p));
    expect(views).toHaveLength(1);
    expect(views[0].own).toBe(false);
    // The very same door, not a copy of it.
    expect(views[0].opening.id).toBe(p.openings[0].id);
  });

  it("never adds a second door to the project", () => {
    const p = withDoorOnB();
    wallOpeningViews(p, touchingWall(p));
    expect(p.openings).toHaveLength(1);
  });

  it("leaves the stored door untouched, hinge and swing included", () => {
    const p = withDoorOnB();
    const before = { ...p.openings[0] };
    wallOpeningViews(p, touchingWall(p));
    expect(p.openings[0]).toEqual(before);
  });

  it("places the door at the same point in the plan seen from either wall", () => {
    const p = withDoorOnB();
    const fromB = wallOpeningViews(p, wall(p, "B").id)[0];
    const other = touchingWall(p);
    const fromOther = wallOpeningViews(p, other)[0];

    const at = (wallId: string, offset: number) => {
      const ends = wallEnds(p, wallId);
      const len = Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y);
      return {
        x: Math.round(ends.a.x + ((ends.b.x - ends.a.x) / len) * offset),
        y: Math.round(ends.a.y + ((ends.b.y - ends.a.y) / len) * offset),
      };
    };
    expect(at(other, fromOther.offset)).toEqual(at(wall(p, "B").id, fromB.offset));
  });

  it("describes the same physical hinge and swing from the other side", () => {
    const p = withDoorOnB();
    const mine = wallOpeningViews(p, wall(p, "B").id)[0];
    const theirs = wallOpeningViews(p, touchingWall(p))[0];
    // The two walls run opposite ways, so the same jamb and the same swing direction
    // are named differently from each side. The door itself has not moved.
    expect(theirs.hinge).not.toBe(mine.hinge);
    expect(theirs.swing).not.toBe(mine.swing);
  });

  it("follows the door when it is moved, from both sides at once", () => {
    let p = withDoorOnB();
    const id = p.openings[0].id;
    p = { ...p, openings: p.openings.map((o) => ({ ...o, offset: 2000 })) };

    expect(wallOpeningViews(p, wall(p, "B").id)[0].offset).toBe(2000);
    // Still one door, and the other side sees the move too.
    expect(p.openings).toHaveLength(1);
    expect(wallOpeningViews(p, touchingWall(p))[0].opening.id).toBe(id);
    expect(wallOpeningViews(p, touchingWall(p))[0].offset).toBe(1000);
  });

  it("shows nothing extra once the rooms are pulled apart", () => {
    let p = withDoorOnB();
    const other = touchingWall(p);
    p = moveLoop(p, wall(p, "E").id, 5000, 0);
    expect(wallOpeningViews(p, other)).toEqual([]);
    expect(wallOpeningViews(p, wall(p, "B").id)).toHaveLength(1);
  });

  it("shares a passage as readily as a door", () => {
    const start = pushedTogether();
    const built = addOpeningAtOffset(start, wall(start, "B").id, 1200, "passage").project;
    const views = wallOpeningViews(built, touchingWall(built));
    expect(views[0]?.opening.kind).toBe("passage");
  });

  it("does not show an opening that only half reaches the shared stretch", () => {
    let p = pushedTogether();
    p = moveLoop(p, wall(p, "E").id, 0, 2800);
    p = addOpeningAtOffset(p, wall(p, "B").id, 1000, "door").project;
    // The wall of the other room, not wall B itself, which trivially lies on itself.
    const bId = wall(p, "B").id;
    const other = loopWallIds(p, wall(p, "E").id).find((id) => sharedSpan(p, id, bId));
    expect(other).toBeDefined();
    expect(wallOpeningViews(p, other!)).toEqual([]);
  });
});
