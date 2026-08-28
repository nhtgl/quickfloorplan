import type { Point } from "../model/types";
import { DIM } from "./theme";

type DimLineProps = {
  from: Point;
  to: Point;
  label: string;
  /** Perpendicular offset in mm. Positive is the left-hand side of from->to. */
  offset: number;
  /** mm per rendered pixel, so text and strokes stay a constant visual size. */
  mmPerPx: number;
  color?: string;
  /** Marks a chain segment as solid wall or opening, for tests and styling. */
  "data-kind"?: string;
};

/**
 * A dimension line with extension lines and ticks, drawn parallel to from->to. Text is
 * kept upright: an upside-down measurement is unreadable on a printout.
 */
export function DimLine({
  from,
  to,
  label,
  offset,
  mmPerPx,
  color = DIM,
  "data-kind": dataKind,
}: DimLineProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const nx = -dy / len;
  const ny = dx / len;
  const a = { x: from.x + nx * offset, y: from.y + ny * offset };
  const b = { x: to.x + nx * offset, y: to.y + ny * offset };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;

  const stroke = mmPerPx;
  const tick = 5 * mmPerPx;
  const font = 11 * mmPerPx;

  return (
    <g data-testid="dim" data-kind={dataKind}>
      <line x1={from.x} y1={from.y} x2={a.x} y2={a.y} stroke={color} strokeWidth={stroke} />
      <line x1={to.x} y1={to.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={stroke} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={stroke} />
      <line
        x1={a.x - nx * tick}
        y1={a.y - ny * tick}
        x2={a.x + nx * tick}
        y2={a.y + ny * tick}
        stroke={color}
        strokeWidth={stroke}
      />
      <line
        x1={b.x - nx * tick}
        y1={b.y - ny * tick}
        x2={b.x + nx * tick}
        y2={b.y + ny * tick}
        stroke={color}
        strokeWidth={stroke}
      />
      <text
        data-testid="dim-label"
        x={mid.x}
        y={mid.y - 4 * mmPerPx}
        fill={color}
        fontSize={font}
        fontFamily="Helvetica, Arial, sans-serif"
        textAnchor="middle"
        transform={`rotate(${deg} ${mid.x} ${mid.y})`}
      >
        {label}
      </text>
    </g>
  );
}
