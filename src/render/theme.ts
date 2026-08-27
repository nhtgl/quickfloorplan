/**
 * Tints are deliberately pale. A plan whose dimension text disappears under a room fill
 * is worse than one with no colour at all, and these have to survive a greyscale printer.
 */
export const ROOM_TINTS = [
  "#e8f0fe",
  "#e6f4ea",
  "#fef7e0",
  "#fce8e6",
  "#f3e8fd",
  "#e0f7fa",
  "#fff0e6",
  "#eceff1",
];

export function nextTint(usedCount: number): string {
  return ROOM_TINTS[usedCount % ROOM_TINTS.length];
}

export const INK = "#1a1a1a";
export const PAPER = "#ffffff";
export const WALL = "#2b2b2b";
export const DIM = "#6b6b6b";
export const ACCENT = "#1266d4";
export const ALERT = "#c5221f";
export const NOTIONAL = "#8a8a8a";
