import { describe, it, expect } from "vitest";
import { emptyProject } from "./../model/factory";
import { buildFromMeasurements, parseMeasurements } from "../model/fromMeasurements";
import { loopNodeIds } from "../model/loops";
import { snapLoopDelta } from "./loopSnap";
import type { Project } from "../model/types";

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

const wall = (p: Project, label: string) => p.walls.find((w) => w.label === label)!.id;

/** What the moving corners would be if the drag were applied as given. */
function movedXs(p: Project, wallId: string, dx: number) {
  const ids = new Set(loopNodeIds(p, wallId));
  return p.nodes.filter((n) => ids.has(n.id)).map((n) => n.x + dx);
}

describe("snapLoopDelta", () => {
  // 10mm per pixel, so alignment reaches 80mm.
  const base = (p: Project) => ({ project: p, wallId: wall(p, "E"), mmPerPx: 10 });

  it("pulls the run onto a stationary corner's x", () => {
    const p = twoRooms();
    const statics = new Set(
      p.nodes.filter((n) => !loopNodeIds(p, wall(p, "E")).includes(n.id)).map((n) => n.x),
    );
    // Aim 30mm short of an x the other room occupies.
    const target = [...statics][1];
    const moving = movedXs(p, wall(p, "E"), 0);
    const dx = target - moving[0] - 30;

    const r = snapLoopDelta({ ...base(p), rawDelta: { x: dx, y: 0 } });
    expect(movedXs(p, wall(p, "E"), r.delta.x)).toContain(target);
    expect(r.guides.some((g) => g.axis === "x")).toBe(true);
  });

  it("settles each axis on its own, so a flush room can slide along", () => {
    const p = twoRooms();
    const r = snapLoopDelta({ ...base(p), rawDelta: { x: 0, y: 5000 } });
    // Far from any y worth snapping to, so y is left as dragged.
    expect(r.delta.y).toBe(5000);
  });

  it("leaves a drag alone when nothing is near", () => {
    const p = twoRooms();
    const r = snapLoopDelta({ ...base(p), rawDelta: { x: 40_000, y: 40_000 } });
    expect(r.delta).toEqual({ x: 40_000, y: 40_000 });
    expect(r.guides).toEqual([]);
  });

  it("scales its reach with the zoom, so the feel holds at any scale", () => {
    const p = twoRooms();
    const statics = p.nodes
      .filter((n) => !loopNodeIds(p, wall(p, "E")).includes(n.id))
      .map((n) => n.x);
    const dx = statics[0] - movedXs(p, wall(p, "E"), 0)[0] - 30;

    // At 1mm per pixel a 30mm miss is 30 pixels out, far beyond tolerance. The rooms
    // already share a y, so that axis still reports a guide; only x should be untouched.
    const zoomedIn = snapLoopDelta({ ...base(p), mmPerPx: 1, rawDelta: { x: dx, y: 0 } });
    expect(zoomedIn.guides.some((g) => g.axis === "x")).toBe(false);
    expect(zoomedIn.delta.x).toBe(dx);
  });

  it("does nothing when there is only one room to move", () => {
    const parse = parseMeasurements("400,90,300,90,400,90,300,90", "cm", false);
    if (!parse.ok) throw new Error(parse.error);
    const only = buildFromMeasurements(
      { ...emptyProject("t"), units: "cm", measureFrom: "centre" },
      parse.value,
      { thickness: 100, name: "Only" },
    ).project;
    const r = snapLoopDelta({
      project: only,
      wallId: wall(only, "A"),
      rawDelta: { x: 7, y: 9 },
      mmPerPx: 10,
    });
    expect(r.delta).toEqual({ x: 7, y: 9 });
  });
});
