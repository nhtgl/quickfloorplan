import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "./factory";
import { newId } from "./ids";
import { doorSwingArc, openingPlanSegment, openingRect } from "./openings";
import { projectWarnings } from "./validate";
import type { Opening, Project } from "./types";

/** Closed rectangle measured on its centrelines, so chain numbers are the raw geometry. */
function wallProject(): Project {
  return centreMeasured(chainOfWalls(
    emptyProject("t"),
    [
      { x: 0, y: 0 },
      { x: 4200, y: 0 },
      { x: 4200, y: 3100 },
      { x: 0, y: 3100 },
    ],
    true,
  ));
}

function centreMeasured(p: Project): Project {
  return { ...p, measureFrom: "centre" };
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

describe("labelOffsetAlongWall", () => {
  it("centres the label on a bare wall", async () => {
    const { labelOffsetAlongWall } = await import("./openings");
    const p = wallProject();
    expect(labelOffsetAlongWall(p, p.walls[0].id)).toBe(2100);
  });

  it("keeps the label off an opening that straddles the midpoint", async () => {
    const { labelOffsetAlongWall } = await import("./openings");
    const p = wallProject();
    const { project } = withOpening(p, { offset: 2100, width: 1200 });
    const wallId = project.walls[0].id;
    const at = labelOffsetAlongWall(project, wallId);
    // The opening spans 1500..2700, so the label must sit outside that.
    expect(at < 1500 || at > 2700).toBe(true);
  });

  it("picks the widest stretch of solid wall", async () => {
    const { labelOffsetAlongWall } = await import("./openings");
    let p = wallProject();
    // Leaves solid runs of 0..500, 1500..2500 and 3500..4200; the middle one is widest.
    p = withOpening(p, { offset: 1000, width: 1000 }).project;
    p = withOpening(p, { offset: 3000, width: 1000 }).project;
    expect(labelOffsetAlongWall(p, p.walls[0].id)).toBe(2000);
  });
});

describe("wallDimensionChain", () => {
  it("tiles the inside faces when the project measures from inside", async () => {
    const { wallDimensionChain } = await import("./openings");
    const { wallMeasuredLength } = await import("./measure");
    const inside: Project = { ...withOpening(wallProject(), { offset: 1500, width: 1200 }).project, measureFrom: "inside" };
    const wallId = inside.walls[0].id;
    const chain = wallDimensionChain(inside, wallId);
    // Each end loses half the neighbouring wall's thickness.
    expect(chain.map((c) => [c.kind, c.end - c.start])).toEqual([
      ["solid", 850],
      ["opening", 1200],
      ["solid", 2050],
    ]);
    expect(chain.reduce((n, c) => n + (c.end - c.start), 0)).toBe(
      wallMeasuredLength(inside, wallId),
    );
  });

  it("is a single run for a bare wall", async () => {
    const { wallDimensionChain } = await import("./openings");
    const p = wallProject();
    expect(wallDimensionChain(p, p.walls[0].id)).toEqual([
      { start: 0, end: 4200, kind: "solid", openingIds: [] },
    ]);
  });

  it("reads corner, opening, corner and tiles the whole wall", async () => {
    const { wallDimensionChain } = await import("./openings");
    const { project } = withOpening(wallProject(), { offset: 1500, width: 1200 });
    const chain = wallDimensionChain(project, project.walls[0].id);
    expect(chain.map((c) => [c.kind, c.end - c.start])).toEqual([
      ["solid", 900],
      ["opening", 1200],
      ["solid", 2100],
    ]);
    // The segments add up to the wall, which is what makes the chain checkable on site.
    expect(chain.reduce((n, c) => n + (c.end - c.start), 0)).toBe(4200);
  });

  it("omits a zero-length run when an opening is flush with a corner", async () => {
    const { wallDimensionChain } = await import("./openings");
    const { project } = withOpening(wallProject(), { offset: 600, width: 1200 });
    const chain = wallDimensionChain(project, project.walls[0].id);
    expect(chain.map((c) => c.kind)).toEqual(["opening", "solid"]);
  });

  it("merges overlapping openings so the chain still adds up", async () => {
    const { wallDimensionChain } = await import("./openings");
    let p = wallProject();
    p = withOpening(p, { offset: 1000, width: 1000 }).project;
    p = withOpening(p, { offset: 1600, width: 1000 }).project;
    const chain = wallDimensionChain(p, p.walls[0].id);
    expect(chain.filter((c) => c.kind === "opening")).toHaveLength(1);
    expect(chain.reduce((n, c) => n + (c.end - c.start), 0)).toBe(4200);
  });

  it("clamps an opening that runs past the end of its wall", async () => {
    const { wallDimensionChain } = await import("./openings");
    const { project } = withOpening(wallProject(), { offset: 4000, width: 1200 });
    const chain = wallDimensionChain(project, project.walls[0].id);
    expect(chain.reduce((n, c) => n + (c.end - c.start), 0)).toBe(4200);
  });
});
