import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { newId } from "./ids";
import { doorSwingArc, openingPlanSegment, openingRect } from "./openings";
import { projectWarnings } from "./validate";
import type { Opening, Project } from "./types";

function wallProject(): Project {
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

function withOpening(p: Project, o: Partial<Opening>): { project: Project; id: string } {
  const opening: Opening = {
    id: newId("o"),
    wallId: p.walls[0].id,
    kind: "window",
    offset: 900,
    width: 1200,
    height: 1400,
    sill: 900,
    ...o,
  };
  return { project: { ...p, openings: [...p.openings, opening] }, id: opening.id };
}

describe("openingRect", () => {
  it("places the opening on the elevation from wall.a and from the floor", () => {
    const { project, id } = withOpening(wallProject(), {});
    // offset is to the centre, so the left edge sits half a width back.
    expect(openingRect(project, id)).toEqual({ x: 300, y: 900, w: 1200, h: 1400 });
  });

  it("puts a door on the floor", () => {
    const { project, id } = withOpening(wallProject(), {
      kind: "door",
      height: 2050,
      sill: 0,
      offset: 1500,
      width: 900,
      hinge: "a",
      swing: "in",
    });
    expect(openingRect(project, id)).toEqual({ x: 1050, y: 0, w: 900, h: 2050 });
  });
});

describe("openingPlanSegment", () => {
  it("spans the opening along the wall in plan coordinates", () => {
    const { project, id } = withOpening(wallProject(), {});
    expect(openingPlanSegment(project, id)).toEqual({
      from: { x: 300, y: 0 },
      to: { x: 1500, y: 0 },
    });
  });
});

describe("doorSwingArc", () => {
  it("is null for anything that is not a door", () => {
    const { project, id } = withOpening(wallProject(), { kind: "window" });
    expect(doorSwingArc(project, id)).toBeNull();
  });

  it("hinges at the end the door names, with the leaf as long as the opening", () => {
    const { project, id } = withOpening(wallProject(), {
      kind: "door",
      offset: 1500,
      width: 900,
      sill: 0,
      hinge: "a",
      swing: "in",
    });
    const arc = doorSwingArc(project, id)!;
    expect(arc.r).toBe(900);
    expect(arc).toMatchObject({ cx: 1050, cy: 0 });
  });
});

describe("projectWarnings", () => {
  it("is empty for a sound project", () => {
    const { project } = withOpening(wallProject(), {});
    expect(projectWarnings(project)).toEqual([]);
  });

  it("flags an opening wider than its wall", () => {
    const { project } = withOpening(wallProject(), { width: 9000, offset: 2100 });
    expect(projectWarnings(project).map((w) => w.kind)).toContain("opening-too-wide");
  });

  it("flags an opening that runs past the end of its wall", () => {
    const { project } = withOpening(wallProject(), { offset: 4000, width: 1200 });
    expect(projectWarnings(project).map((w) => w.kind)).toContain("opening-past-end");
  });

  it("flags two openings that overlap, once", () => {
    let p = wallProject();
    p = withOpening(p, { offset: 1000, width: 1000 }).project;
    p = withOpening(p, { offset: 1500, width: 1000 }).project;
    const overlaps = projectWarnings(p).filter((w) => w.kind === "openings-overlap");
    expect(overlaps).toHaveLength(1);
  });

  it("does not flag openings that merely touch end to end", () => {
    let p = wallProject();
    p = withOpening(p, { offset: 1000, width: 1000 }).project;
    p = withOpening(p, { offset: 2000, width: 1000 }).project;
    expect(projectWarnings(p).filter((w) => w.kind === "openings-overlap")).toEqual([]);
  });

  it("flags a self-intersecting room", () => {
    const p = wallProject();
    p.rooms = [
      {
        id: newId("r"),
        name: "Bowtie",
        tint: "#eee",
        polygon: [
          { x: 0, y: 0 },
          { x: 4000, y: 4000 },
          { x: 4000, y: 0 },
          { x: 0, y: 4000 },
        ],
      },
    ];
    expect(projectWarnings(p).map((w) => w.kind)).toContain("room-self-intersects");
  });

  it("flags a room with too few vertices", () => {
    const p = wallProject();
    p.rooms = [
      { id: newId("r"), name: "Line", tint: "#eee", polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ];
    expect(projectWarnings(p).map((w) => w.kind)).toContain("room-degenerate");
  });
});
