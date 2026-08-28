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
  it("puts the plan first, then the sketch page, then one page per wall", () => {
    const titles = pageTitles(base());
    expect(titles).toHaveLength(6);
    expect(titles[0]).toBe("Floor Plan");
    expect(titles[1]).toBe("Sketch Plan");
    expect(titles.slice(2)).toEqual(["Wall A", "Wall B", "Wall C", "Wall D"]);
  });

  it("adds a page per photo at the end, titled by its caption", async () => {
    const { addPhoto, makePhoto } = await import("../model/photos");
    let p = base();
    p = addPhoto(p, makePhoto({
      name: "kitchen.jpg", caption: "Kitchen, looking north",
      dataUrl: "data:image/jpeg;base64,AAAA", width: 1400, height: 1050,
    }));
    p = addPhoto(p, makePhoto({
      name: "hall.jpg", caption: "",
      dataUrl: "data:image/jpeg;base64,AAAA", width: 1050, height: 1400,
    }));
    const titles = pageTitles(p);
    expect(titles).toHaveLength(8);
    expect(titles.slice(-2)).toEqual(["Kitchen, looking north", "Photo 2"]);
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
