import { roomsForWall } from "../model/rooms";
import { photoTitle, projectPhotos } from "../model/photos";
import type { Project } from "../model/types";

/**
 * A wall can genuinely face more than one room once rooms are free polygons, so the
 * title names all of them rather than picking a winner.
 */
export function elevationTitle(p: Project, wallId: string): string {
  const wall = p.walls.find((w) => w.id === wallId)!;
  const roomNames = roomsForWall(p, wallId)
    .map((id) => p.rooms.find((r) => r.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const base = `Wall ${wall.label}`;
  return roomNames.length ? `${base} — ${roomNames.join(" / ")}` : base;
}

export const SKETCH_TITLE = "Sketch Plan";

export function pageTitles(p: Project): string[] {
  return [
    "Floor Plan",
    SKETCH_TITLE,
    ...p.walls.map((w) => elevationTitle(p, w.id)),
    ...projectPhotos(p).map((ph, i) => photoTitle(ph, i)),
  ];
}
