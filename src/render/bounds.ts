import type { Project } from "../model/types";

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Extent of everything drawable, in mm. Falls back to a sensible empty page. */
export function planBounds(p: Project): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of p.nodes) {
    xs.push(n.x);
    ys.push(n.y);
  }
  for (const r of p.rooms) {
    for (const pt of r.polygon) {
      xs.push(pt.x);
      ys.push(pt.y);
    }
  }
  if (xs.length === 0) return { minX: 0, minY: 0, maxX: 10_000, maxY: 7_000 };
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * A viewBox that fits `box` into a width x height frame with margin, preserving aspect
 * ratio. Returns the viewBox string plus the mm-per-pixel scale, which callers use to
 * keep text and stroke widths a constant visual size at any zoom.
 */
export function fitViewBox(
  box: Box,
  width: number,
  height: number,
  marginFraction = 0.08,
): { viewBox: string; mmPerPx: number } {
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const margin = Math.max(w, h) * marginFraction;
  const cw = w + margin * 2;
  const ch = h + margin * 2;

  const scale = Math.max(cw / width, ch / height);
  const vbW = width * scale;
  const vbH = height * scale;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;

  return {
    viewBox: `${cx - vbW / 2} ${cy - vbH / 2} ${vbW} ${vbH}`,
    mmPerPx: scale,
  };
}
