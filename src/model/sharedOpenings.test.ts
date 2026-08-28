import { describe, it, expect } from "vitest";
import { emptyProject } from "./factory";
import { buildFromMeasurements, parseMeasurements } from "./fromMeasurements";
import { loopWallIds, moveLoop } from "./loops";
import { addOpeningAtOffset } from "./ops";
import { openingPlanSegment } from "./openings";
import { sharedSpan, shareOpeningsAcrossTouchingWalls } from "./sharedOpenings";
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

describe("shareOpeningsAcrossTouchingWalls", () => {
  function withDoorOnB(): Project {
    const p = pushedTogether();
    return addOpeningAtOffset(p, wall(p, "B").id, 1200, "door").project;
  }

  it("gives the newly touching wall the same door", () => {
    const p = withDoorOnB();
    const moved = loopWallIds(p, wall(p, "E").id);
    const { project, added } = shareOpeningsAcrossTouchingWalls(p, moved);

    expect(added).toHaveLength(1);
    expect(added[0].wallId).toBe(touchingWall(p));
    expect(project.openings).toHaveLength(2);
  });

  it("puts the copy in the same place in the plan, not the same distance along", () => {
    const p = withDoorOnB();
    const original = p.openings[0];
    const { project, added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));

    const before = openingPlanSegment(p, original.id);
    const after = openingPlanSegment(project, added[0].id);
    // Same physical doorway: the two spans cover the same points.
    const ends = [after.from, after.to].sort((u, v) => u.y - v.y);
    const was = [before.from, before.to].sort((u, v) => u.y - v.y);
    expect(ends[0].y).toBe(was[0].y);
    expect(ends[1].y).toBe(was[1].y);
  });

  it("flips the hinge and the swing, so the leaf still opens the same way", () => {
    const p = withDoorOnB();
    const original = p.openings[0];
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    // The walls run opposite ways, so both have to flip to describe one physical door.
    expect(added[0].hinge).not.toBe(original.hinge);
    expect(added[0].swing).not.toBe(original.swing);
  });

  it("keeps the door's size", () => {
    const p = withDoorOnB();
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    expect(added[0]).toMatchObject({ kind: "door", width: 900, height: 2050, sill: 0 });
  });

  it("works the other way too: a door in the moved room reaches the wall it lands on", () => {
    let p = pushedTogether();
    p = addOpeningAtOffset(p, touchingWall(p), 1200, "door").project;
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    expect(added).toHaveLength(1);
    expect(added[0].wallId).toBe(wall(p, "B").id);
  });

  it("does not add the door twice when the rooms are moved again", () => {
    const p = withDoorOnB();
    const once = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    const twice = shareOpeningsAcrossTouchingWalls(
      once.project,
      loopWallIds(once.project, wall(once.project, "E").id),
    );
    expect(twice.added).toHaveLength(0);
    expect(twice.project.openings).toHaveLength(2);
  });

  it("leaves rooms that are not touching alone", () => {
    let p = pushedTogether();
    p = addOpeningAtOffset(p, wall(p, "B").id, 1200, "door").project;
    p = moveLoop(p, wall(p, "E").id, 5000, 0);
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    expect(added).toEqual([]);
  });

  it("carries a passage across as readily as a door", () => {
    let p = pushedTogether();
    p = addOpeningAtOffset(p, wall(p, "B").id, 1200, "passage").project;
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    expect(added[0].kind).toBe("passage");
  });

  it("leaves an opening that only half overlaps the shared stretch", () => {
    let p = pushedTogether();
    // Shift the second room so only part of the two walls coincide.
    p = moveLoop(p, wall(p, "E").id, 0, 2800);
    p = addOpeningAtOffset(p, wall(p, "B").id, 1000, "door").project;
    const { added } = shareOpeningsAcrossTouchingWalls(p, loopWallIds(p, wall(p, "E").id));
    expect(added).toEqual([]);
  });
});
