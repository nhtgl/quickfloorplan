import { roomsForWall } from "../model/rooms";
import { wallElevationSides, wallSideNames } from "../model/faces";
import { photoTitle, projectPhotos } from "../model/photos";
import type { Project } from "../model/types";

/**
 * A wall can genuinely face more than one room once rooms are free polygons, so the
 * title names all of them rather than picking a winner.
 */
export function elevationTitle(p: Project, wallId: string, side?: number): string {
  const wall = p.walls.find((w) => w.id === wallId)!;
  const roomNames = roomsForWall(p, wallId)
    .map((id) => p.rooms.find((r) => r.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const base = `Wall ${wall.label}`;
  const named = roomNames.length ? `${base} — ${roomNames.join(" / ")}` : base;

  // A wall showing both its sides needs its two pages told apart.
  if (side === undefined || wallElevationSides(p, wallId).length < 2) return named;
  const names = wallSideNames(p, wallId);
  return `${named} (from the ${side >= 0 ? names.left : names.right} side)`;
}

/** Every elevation page the project will produce, as a wall and the side it shows. */
export function elevationPages(p: Project): { wallId: string; side: number }[] {
  return p.walls.flatMap((w) =>
    wallElevationSides(p, w.id).map((side) => ({ wallId: w.id, side })),
  );
}

export const SKETCH_TITLE = "Sketch Plan";

export function pageTitles(p: Project): string[] {
  return [
    "Floor Plan",
    SKETCH_TITLE,
    ...elevationPages(p).map(({ wallId, side }) => elevationTitle(p, wallId, side)),
    ...projectPhotos(p).map((ph, i) => photoTitle(ph, i)),
  ];
}
