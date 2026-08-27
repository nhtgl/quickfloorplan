import { useCallback, useRef, useState } from "react";
import { fitViewBox, planBounds } from "../render/bounds";
import type { Point, Project } from "../model/types";

export type Viewport = { cx: number; cy: number; mmPerPx: number };

export function useViewport(width: number, height: number) {
  const [vp, setVp] = useState<Viewport | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const fit = useCallback(
    (p: Project) => {
      const box = planBounds(p);
      const { mmPerPx } = fitViewBox(box, width, height);
      setVp({
        cx: (box.minX + box.maxX) / 2,
        cy: (box.minY + box.maxY) / 2,
        mmPerPx,
      });
    },
    [width, height],
  );

  const current: Viewport = vp ?? { cx: 0, cy: 0, mmPerPx: 12 };
  const viewBox = `${current.cx - (width * current.mmPerPx) / 2} ${
    current.cy - (height * current.mmPerPx) / 2
  } ${width * current.mmPerPx} ${height * current.mmPerPx}`;

  /** Screen pixels to plan millimetres. */
  const toPlan = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const px = rect ? clientX - rect.left : clientX;
      const py = rect ? clientY - rect.top : clientY;
      return {
        x: current.cx + (px - width / 2) * current.mmPerPx,
        y: current.cy + (py - height / 2) * current.mmPerPx,
      };
    },
    [current.cx, current.cy, current.mmPerPx, width, height],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const anchor = toPlan(clientX, clientY);
      setVp((prev) => {
        const base = prev ?? current;
        const next = Math.min(200, Math.max(0.5, base.mmPerPx * factor));
        const k = next / base.mmPerPx;
        return {
          mmPerPx: next,
          cx: anchor.x + (base.cx - anchor.x) * k,
          cy: anchor.y + (base.cy - anchor.y) * k,
        };
      });
    },
    [toPlan, current],
  );

  const panBy = useCallback((dxPx: number, dyPx: number) => {
    setVp((prev) => {
      const base = prev ?? { cx: 0, cy: 0, mmPerPx: 12 };
      return { ...base, cx: base.cx - dxPx * base.mmPerPx, cy: base.cy - dyPx * base.mmPerPx };
    });
  }, []);

  return { viewport: current, viewBox, svgRef, fit, toPlan, zoomAt, panBy };
}
