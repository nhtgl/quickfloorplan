import { openLoops, wallHeight, wallLength } from "./geometry";
import { openingSpan } from "./openings";
import { polygonSelfIntersects, roomsOverlap } from "./rooms";
import { projectUnit } from "./factory";
import type { Project } from "./types";
import { formatLengthWithUnit } from "./units";

export type WarningKind =
  | "opening-too-wide"
  | "opening-past-end"
  | "opening-too-tall"
  | "openings-overlap"
  | "loop-open"
  | "room-self-intersects"
  | "room-degenerate"
  | "rooms-overlap";

export type Warning = {
  kind: WarningKind;
  targetIds: string[];
  message: string;
};

/**
 * Every geometric complaint in the project. Nothing here blocks saving or exporting:
 * the user is sketching a real flat from tape measurements, so the numbers will be
 * inconsistent mid-edit. The tool nags; it never blocks.
 */
export function projectWarnings(p: Project): Warning[] {
  const out: Warning[] = [];
  const unit = projectUnit(p);
  const len = (mm: number) => formatLengthWithUnit(mm, unit);

  for (const wall of p.walls) {
    const wallLen = wallLength(p, wall.id);
    const height = wallHeight(p, wall.id);
    const openings = p.openings.filter((o) => o.wallId === wall.id);

    for (const o of openings) {
      if (o.width > wallLen) {
        out.push({
          kind: "opening-too-wide",
          targetIds: [o.id],
          message: `Opening is ${len(o.width)} wide but wall ${wall.label} is only ${len(wallLen)}.`,
        });
      } else {
        const [start, end] = openingSpan(p, o.id);
        if (start < 0 || end > wallLen) {
          out.push({
            kind: "opening-past-end",
            targetIds: [o.id],
            message: `Opening runs past the end of wall ${wall.label}.`,
          });
        }
      }
      if (o.sill + o.height > height) {
        out.push({
          kind: "opening-too-tall",
          targetIds: [o.id],
          message: `Opening reaches ${len(o.sill + o.height)} but wall ${wall.label} is ${len(height)} high.`,
        });
      }
    }

    for (let i = 0; i < openings.length; i += 1) {
      for (let j = i + 1; j < openings.length; j += 1) {
        const [s1, e1] = openingSpan(p, openings[i].id);
        const [s2, e2] = openingSpan(p, openings[j].id);
        // Strict, so openings that merely meet end to end are fine.
        if (s1 < e2 && s2 < e1) {
          out.push({
            kind: "openings-overlap",
            targetIds: [openings[i].id, openings[j].id],
            message: `Two openings overlap on wall ${wall.label}.`,
          });
        }
      }
    }
  }

  for (const loop of openLoops(p)) {
    if (loop.gap === 0) continue;
    out.push({
      kind: "loop-open",
      targetIds: [loop.nodeId, loop.partnerId],
      message: `Loop is open by ${len(loop.gap)}. Adjust another wall to close it.`,
    });
  }

  for (const room of p.rooms) {
    if (room.polygon.length < 3) {
      out.push({
        kind: "room-degenerate",
        targetIds: [room.id],
        message: `Room "${room.name}" needs at least three corners.`,
      });
    } else if (polygonSelfIntersects(room.polygon)) {
      out.push({
        kind: "room-self-intersects",
        targetIds: [room.id],
        message: `Room "${room.name}" crosses over itself.`,
      });
    }
  }

  for (let i = 0; i < p.rooms.length; i += 1) {
    for (let j = i + 1; j < p.rooms.length; j += 1) {
      if (roomsOverlap(p.rooms[i], p.rooms[j])) {
        out.push({
          kind: "rooms-overlap",
          targetIds: [p.rooms[i].id, p.rooms[j].id],
          message: `"${p.rooms[i].name}" and "${p.rooms[j].name}" overlap, so their areas double-count.`,
        });
      }
    }
  }

  return out;
}
