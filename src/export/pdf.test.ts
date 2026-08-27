import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "../model/factory";
import { newId } from "../model/ids";
import { elevationTitle, pageTitles } from "./pageTitles";
import type { Point, Project } from "../model/types";

const RECT: Point[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];

const base = (): Project => chainOfWalls(emptyProject("Flat"), RECT, true);
const byLabel = (p: Project, l: string) => p.walls.find((w) => w.label === l)!;

describe("pageTitles", () => {
  it("puts the plan first and one page per wall after it", () => {
    const titles = pageTitles(base());
    expect(titles).toHaveLength(5);
    expect(titles[0]).toBe("Floor Plan");
  });

  it("leaves a wall with no room untitled beyond its label", () => {
    const p = base();
    expect(elevationTitle(p, byLabel(p, "A").id)).toBe("Wall A");
  });

  it("names the room a wall faces", () => {
    const p = base();
    p.rooms = [{ id: newId("r"), name: "Kitchen", tint: "#eee", polygon: RECT }];
    expect(elevationTitle(p, byLabel(p, "A").id)).toBe("Wall A — Kitchen");
  });

  it("names every room a wall borders, in project order", () => {
    const p = base();
    p.rooms = [
      {
        id: newId("r"),
        name: "Hall",
        tint: "#eee",
        polygon: [
          { x: 0, y: 0 },
          { x: 1500, y: 0 },
          { x: 1500, y: 3100 },
          { x: 0, y: 3100 },
        ],
      },
      {
        id: newId("r"),
        name: "Dining",
        tint: "#eee",
        polygon: [
          { x: 1500, y: 0 },
          { x: 4200, y: 0 },
          { x: 4200, y: 3100 },
          { x: 1500, y: 3100 },
        ],
      },
    ];
    expect(elevationTitle(p, byLabel(p, "A").id)).toBe("Wall A — Hall / Dining");
  });
});

/**
 * exportPdf itself is not exercised here. jsdom has no SVG layout: it implements neither
 * getBBox nor SVGTextElement.x.baseVal, so svg2pdf reads null coordinates and every text
 * run fails. Stubbing those would only test the stubs. The real check runs a built app in
 * Chromium and inspects the PDF it produces — see scripts/verify-browser.mjs, `npm run verify`.
 */
