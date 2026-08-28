import { newId } from "./ids";
import type { Photo, Project } from "./types";

/** Longest edge a stored photo is scaled down to, in pixels. */
export const MAX_PHOTO_EDGE = 1400;

/** JPEG quality used when re-encoding. */
export const PHOTO_QUALITY = 0.75;

/**
 * Photos live in the project file as data URIs, which keeps a project one portable file
 * but makes it grow fast. Past this the file gets awkward to email and the browser's
 * autosave store starts refusing it, so the user is warned.
 */
export const PHOTO_BUDGET_BYTES = 3_000_000;

export function projectPhotos(p: Project): Photo[] {
  return p.photos ?? [];
}

/** Scale a size down to fit a box, never up. */
export function fitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * scale, height: height * scale };
}

/** Roughly how many bytes a data URI's payload decodes to. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataUrl.length - comma - 1;
  return Math.round(payload * 0.75);
}

export function totalPhotoBytes(p: Project): number {
  return projectPhotos(p).reduce((n, ph) => n + dataUrlBytes(ph.dataUrl), 0);
}

export function makePhoto(fields: Omit<Photo, "id">): Photo {
  return { id: newId("ph"), ...fields };
}

export function addPhoto(p: Project, photo: Photo): Project {
  return {
    ...p,
    photos: [...projectPhotos(p), photo],
    updatedAt: new Date().toISOString(),
  };
}

export function removePhoto(p: Project, id: string): Project {
  return {
    ...p,
    photos: projectPhotos(p).filter((x) => x.id !== id),
    updatedAt: new Date().toISOString(),
  };
}

export function updatePhoto(p: Project, id: string, patch: Partial<Photo>): Project {
  return {
    ...p,
    photos: projectPhotos(p).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    updatedAt: new Date().toISOString(),
  };
}

export function movePhoto(p: Project, id: string, delta: number): Project {
  const photos = [...projectPhotos(p)];
  const i = photos.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= photos.length) return p;
  [photos[i], photos[j]] = [photos[j], photos[i]];
  return { ...p, photos, updatedAt: new Date().toISOString() };
}

/** What a photo's page is called in the PDF. */
export function photoTitle(photo: Photo, index: number): string {
  return photo.caption.trim() || `Photo ${index + 1}`;
}
