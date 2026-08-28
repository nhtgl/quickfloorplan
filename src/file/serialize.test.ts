import { describe, it, expect } from "vitest";
import { chainOfWalls, emptyProject } from "../model/factory";
import { newId } from "../model/ids";
import { deserialize, serialize } from "./serialize";
import type { Project } from "../model/types";

function fullProject(): Project {
  const p = chainOfWalls(
    emptyProject("Flat"),
    [
      { x: 0, y: 0 },
      { x: 4200, y: 0 },
      { x: 4200, y: 3100 },
      { x: 0, y: 3100 },
    ],
    true,
  );
  return {
    ...p,
    openings: [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "door",
        offset: 1500,
        width: 900,
        height: 2050,
        sill: 0,
        hinge: "a",
        swing: "in",
      },
    ],
    rooms: [
      {
        id: newId("r"),
        name: "Dining",
        tint: "#eef3ff",
        polygon: [
          { x: 0, y: 0 },
          { x: 4200, y: 0 },
          { x: 4200, y: 3100 },
          { x: 0, y: 3100 },
        ],
      },
    ],
  };
}

describe("serialize / deserialize", () => {
  it("round-trips a project with walls, openings and rooms exactly", () => {
    const p = fullProject();
    const result = deserialize(serialize(p));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project).toEqual(p);
  });

  it("rejects malformed JSON without throwing", () => {
    const result = deserialize("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not valid JSON/i);
  });

  it("rejects a file with no schema field, naming it", () => {
    const result = deserialize(JSON.stringify({ name: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schema/i);
  });

  it("rejects a different schema version, naming the version found", () => {
    const result = deserialize(JSON.stringify({ ...fullProject(), schema: "quickfloorplan/9" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("quickfloorplan/9");
  });

  it("rejects a wall referencing a node that does not exist", () => {
    const p = fullProject();
    const broken = { ...p, walls: [{ ...p.walls[0], a: "nope" }, ...p.walls.slice(1)] };
    const result = deserialize(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/node/i);
  });
});

describe("photos in a project file", () => {
  const withPhoto = (dataUrl: string) => ({
    ...fullProject(),
    photos: [
      { id: "ph1", name: "kitchen.jpg", caption: "", dataUrl, width: 1400, height: 1050 },
    ],
  });

  it("round-trips a project carrying photos", () => {
    const p = withPhoto("data:image/jpeg;base64,AAAA");
    const result = deserialize(serialize(p));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.photos).toEqual(p.photos);
  });

  it("accepts a file written before photos existed", () => {
    const { photos, ...withoutPhotos } = fullProject() as never as { photos?: unknown };
    void photos;
    const result = deserialize(JSON.stringify(withoutPhotos));
    expect(result.ok).toBe(true);
  });

  it("rejects a photo that does not hold an image, naming it", () => {
    const result = deserialize(JSON.stringify(withPhoto("https://example.com/x.jpg")));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kitchen.jpg");
  });
})
