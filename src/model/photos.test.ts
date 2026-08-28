import { describe, it, expect } from "vitest";
import { emptyProject } from "./factory";
import {
  addPhoto,
  dataUrlBytes,
  fitDimensions,
  makePhoto,
  movePhoto,
  photoTitle,
  projectPhotos,
  removePhoto,
  totalPhotoBytes,
  updatePhoto,
} from "./photos";

const photo = (name: string, caption = "") =>
  makePhoto({
    name,
    caption,
    // A tiny but structurally real data URI.
    dataUrl: `data:image/jpeg;base64,${"A".repeat(400)}`,
    width: 1400,
    height: 1050,
  });

describe("fitDimensions", () => {
  it("scales a landscape image down to fit the width", () => {
    expect(fitDimensions(2000, 1000, 1000, 900)).toEqual({ width: 1000, height: 500 });
  });

  it("scales a portrait image down to fit the height", () => {
    expect(fitDimensions(1000, 2000, 900, 1000)).toEqual({ width: 500, height: 1000 });
  });

  it("never scales a small image up", () => {
    expect(fitDimensions(200, 100, 1000, 900)).toEqual({ width: 200, height: 100 });
  });

  it("handles a degenerate size without dividing by zero", () => {
    expect(fitDimensions(0, 100, 500, 500)).toEqual({ width: 0, height: 0 });
  });
});

describe("dataUrlBytes", () => {
  it("estimates the decoded payload", () => {
    expect(dataUrlBytes(`data:image/jpeg;base64,${"A".repeat(1000)}`)).toBe(750);
  });

  it("is zero for something that is not a data URI", () => {
    expect(dataUrlBytes("nonsense")).toBe(0);
  });
});

describe("photo list", () => {
  it("starts empty and reads as empty for older files without the field", () => {
    expect(projectPhotos(emptyProject("t"))).toEqual([]);
    const legacy = { ...emptyProject("t"), photos: undefined };
    expect(projectPhotos(legacy)).toEqual([]);
  });

  it("adds, captions and removes", () => {
    let p = addPhoto(emptyProject("t"), photo("kitchen.jpg"));
    const id = projectPhotos(p)[0].id;
    p = updatePhoto(p, id, { caption: "Kitchen, looking north" });
    expect(projectPhotos(p)[0].caption).toBe("Kitchen, looking north");
    p = removePhoto(p, id);
    expect(projectPhotos(p)).toEqual([]);
  });

  it("reorders, and refuses to move past either end", () => {
    let p = addPhoto(addPhoto(emptyProject("t"), photo("a.jpg")), photo("b.jpg"));
    const [a, b] = projectPhotos(p);
    p = movePhoto(p, b.id, -1);
    expect(projectPhotos(p).map((x) => x.name)).toEqual(["b.jpg", "a.jpg"]);
    p = movePhoto(p, b.id, -1);
    expect(projectPhotos(p).map((x) => x.name)).toEqual(["b.jpg", "a.jpg"]);
    p = movePhoto(p, a.id, 1);
    expect(projectPhotos(p).map((x) => x.name)).toEqual(["b.jpg", "a.jpg"]);
  });

  it("totals the stored bytes", () => {
    const p = addPhoto(addPhoto(emptyProject("t"), photo("a.jpg")), photo("b.jpg"));
    expect(totalPhotoBytes(p)).toBe(600);
  });
});

describe("photoTitle", () => {
  it("uses the caption when there is one", () => {
    expect(photoTitle(photo("a.jpg", "Bay window"), 0)).toBe("Bay window");
  });

  it("falls back to a numbered title", () => {
    expect(photoTitle(photo("a.jpg"), 2)).toBe("Photo 3");
    expect(photoTitle(photo("a.jpg", "   "), 0)).toBe("Photo 1");
  });
});
