import type { ReactNode } from "react";
import {
  loopCentroid,
  loopGap,
  nodeById,
  pointAlongWall,
  wallAngleDeg,
  wallEnds,
  wallLength,
} from "../model/geometry";
import { projectUnit } from "../model/factory";
import { wallMeasuredLength, wallMeasuredSpan } from "../model/measure";
import {
  doorSwingArc,
  labelOffsetAlongWall,
  openingPlanSegment,
  wallDimensionChain,
} from "../model/openings";
import { viewSpan, wallOpeningViews } from "../model/sharedOpenings";
import { wallCrossSection, wallPolygon } from "../model/faces";
import { edgeHasWallBehind, roomArea } from "../model/rooms";
import type { Point, Project } from "../model/types";
import { formatArea, formatDeg, formatLengthWithUnit } from "../model/units";
import { DimLine } from "./dimensions";
import { fitViewBox, planBounds } from "./bounds";
import { ACCENT, ALERT, DIM, INK, NOTIONAL, PAPER, WALL } from "./theme";

export type PlanSvgProps = {
  project: Project;
  width: number;
  height: number;
  /** Screen supplies its own for pan and zoom; the PDF lets it fit. */
  viewBox?: string;
  mmPerPx?: number;
  showRooms?: boolean;
  showDims?: boolean;
  showLabels?: boolean;
  highlightIds?: string[];
  alertIds?: string[];
  overlay?: ReactNode;
  onPickWall?: (id: string) => void;
  onPickRoom?: (id: string) => void;
  onPickOpening?: (id: string) => void;
  onPickNode?: (id: string) => void;
  onNodePointerDown?: (id: string, e: React.PointerEvent) => void;
  onWallPointerDown?: (id: string, e: React.PointerEvent) => void;
  onRoomPointerDown?: (id: string, e: React.PointerEvent) => void;
  svgRef?: (el: SVGSVGElement | null) => void;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  style?: React.CSSProperties;
};

/** The patch of wall an opening removes: straight across, from face to face. */
function cutPoints(p: Project, wallId: string, from: number, to: number): string {
  const a = wallCrossSection(p, wallId, from);
  const b = wallCrossSection(p, wallId, to);
  return [a.left, b.left, b.right, a.right].map((pt) => `${pt.x},${pt.y}`).join(" ");
}

function centroid(pts: Point[]): Point {
  const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
}

export function PlanSvg(props: PlanSvgProps) {
  const {
    project: p,
    width,
    height,
    showRooms = true,
    showDims = true,
    showLabels = true,
    highlightIds = [],
    alertIds = [],
  } = props;

  const unit = projectUnit(p);
  const fitted = fitViewBox(planBounds(p), width, height);
  const viewBox = props.viewBox ?? fitted.viewBox;
  const mmPerPx = props.mmPerPx ?? fitted.mmPerPx;
  const hairline = mmPerPx;

  const planCentre = p.nodes.length
    ? centroid(p.nodes.map((n) => ({ x: n.x, y: n.y })))
    : { x: 0, y: 0 };

  return (
    <svg
      ref={props.svgRef}
      data-testid="plan-svg"
      width={width}
      height={height}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: PAPER, touchAction: "none", ...props.style }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
    >
      {showRooms &&
        p.rooms.map((room) => {
          const pts = room.polygon.map((pt) => `${pt.x},${pt.y}`).join(" ");
          const c = room.polygon.length ? centroid(room.polygon) : { x: 0, y: 0 };
          const selected = highlightIds.includes(room.id);
          return (
            <g key={room.id} data-testid="room">
              <polygon
                data-testid="room-fill"
                data-room-name={room.name}
                points={pts}
                fill={room.tint}
                stroke={selected ? ACCENT : "none"}
                strokeWidth={selected ? hairline * 2 : 0}
                onPointerDown={(e) => props.onRoomPointerDown?.(room.id, e)}
                onClick={() => props.onPickRoom?.(room.id)}
                style={{ cursor: props.onPickRoom ? "move" : undefined }}
              />
              {room.polygon.map((a, i) => {
                const b = room.polygon[(i + 1) % room.polygon.length];
                if (edgeHasWallBehind(p, a, b)) return null;
                return (
                  <line
                    key={i}
                    data-testid="notional-edge"
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={NOTIONAL}
                    strokeWidth={hairline * 1.5}
                    strokeDasharray={`${8 * mmPerPx} ${6 * mmPerPx}`}
                  />
                );
              })}
              {room.polygon.length >= 3 && (
                <g data-testid="room-label">
                  <text
                    x={c.x}
                    y={c.y}
                    fill={INK}
                    fontSize={13 * mmPerPx}
                    fontFamily="Helvetica, Arial, sans-serif"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {room.name}
                  </text>
                  <text
                    x={c.x}
                    y={c.y + 16 * mmPerPx}
                    fill={DIM}
                    fontSize={11 * mmPerPx}
                    fontFamily="Helvetica, Arial, sans-serif"
                    textAnchor="middle"
                  >
                    {formatArea(roomArea(room))} m²
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {p.walls.map((w) => {
        const selected = highlightIds.includes(w.id);
        return (
          <polygon
            key={w.id}
            data-testid="wall"
            data-wall-label={w.label}
            points={wallPolygon(p, w.id).map((pt) => `${pt.x},${pt.y}`).join(" ")}
            fill={selected ? ACCENT : WALL}
            onPointerDown={(e) => props.onWallPointerDown?.(w.id, e)}
            onClick={() => props.onPickWall?.(w.id)}
            style={{ cursor: props.onPickWall ? "move" : undefined }}
          />
        );
      })}

      {/* The centreline, faint inside the band. A wall is three lines: a face each side,
          which are the edges of the band, and this one between them. */}
      {showDims &&
        p.walls.map((w) => {
          const { a, b } = wallEnds(p, w.id);
          return (
            <line
              key={`${w.id}-centreline`}
              data-testid="wall-centreline"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={hairline}
              strokeDasharray={`${10 * mmPerPx} ${7 * mmPerPx}`}
              style={{ pointerEvents: "none" }}
            />
          );
        })}

      {/* A wall lying on top of another has to cut its own gap, or it would paint over
          the opening the other wall already cut and the door would vanish. */}
      {p.walls.flatMap((w) =>
        wallOpeningViews(p, w.id)
          .filter((view) => !view.own)
          .map((view) => {
            const [start, end] = viewSpan(view);
            return (
              <polygon
                key={`${w.id}-${view.opening.id}-cut`}
                data-testid="shared-opening-cut"
                points={cutPoints(p, w.id, start, end)}
                fill={PAPER}
              />
            );
          }),
      )}

      {/* Openings cut the wall, then draw their own symbol over the gap. */}
      {p.openings.map((o) => {
        const seg = openingPlanSegment(p, o.id);
        const wall = p.walls.find((w) => w.id === o.wallId)!;
        const [cutStart, cutEnd] = viewSpan({ opening: o, own: true, offset: o.offset });
        const arc = doorSwingArc(p, o.id);
        const alert = alertIds.includes(o.id);
        const selected = highlightIds.includes(o.id);
        const colour = alert ? ALERT : selected ? ACCENT : WALL;
        return (
          <g key={o.id} data-testid="opening" data-opening-kind={o.kind}>
            <polygon points={cutPoints(p, wall.id, cutStart, cutEnd)} fill={PAPER} />
            {o.kind === "window" && (
              <line
                data-testid="window-symbol"
                x1={seg.from.x}
                y1={seg.from.y}
                x2={seg.to.x}
                y2={seg.to.y}
                stroke={colour}
                strokeWidth={hairline * 2}
              />
            )}
            {arc && (
              <>
                <path
                  data-testid="door-arc"
                  d={arcPath(arc)}
                  fill="none"
                  stroke={colour}
                  strokeWidth={hairline}
                />
                <line
                  x1={arc.cx}
                  y1={arc.cy}
                  x2={arc.cx + arc.r * Math.cos((arc.endDeg * Math.PI) / 180)}
                  y2={arc.cy + arc.r * Math.sin((arc.endDeg * Math.PI) / 180)}
                  stroke={colour}
                  strokeWidth={hairline * 2}
                />
              </>
            )}
            <line
              x1={seg.from.x}
              y1={seg.from.y}
              x2={seg.to.x}
              y2={seg.to.y}
              stroke="transparent"
              strokeWidth={Math.max(wall.offsets.left + wall.offsets.right, 8 * mmPerPx)}
              onClick={() => props.onPickOpening?.(o.id)}
              style={{ cursor: props.onPickOpening ? "pointer" : undefined }}
            />
          </g>
        );
      })}

      {showDims &&
        p.walls.map((w) => {
          const { a, b } = wallEnds(p, w.id);
          const span = wallMeasuredSpan(p, w.id);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // Push the dimensions to the side facing away from the room this wall encloses,
          // falling back to the whole plan for a wall that encloses nothing.
          const away = loopCentroid(p, w.id) ?? planCentre;
          const nx = -(b.y - a.y);
          const ny = b.x - a.x;
          const outward = (mid.x - away.x) * nx + (mid.y - away.y) * ny >= 0 ? 1 : -1;
          const chain = wallDimensionChain(p, w.id);
          const hasOpenings = chain.some((c) => c.kind === "opening");

          return (
            <g key={`${w.id}-dims`}>
              {/* Setting-out chain nearest the wall; it tiles the wall end to end. */}
              {hasOpenings &&
                chain.map((seg) => (
                  <DimLine
                    key={`${w.id}-${seg.start}`}
                    data-kind={seg.kind}
                    from={pointAlongWall(p, w.id, seg.start)}
                    to={pointAlongWall(p, w.id, seg.end)}
                    label={formatLengthWithUnit(Math.round(seg.end - seg.start), unit)}
                    offset={outward * 22 * mmPerPx}
                    mmPerPx={mmPerPx}
                    color={seg.kind === "opening" ? ACCENT : undefined}
                  />
                ))}
              {/* Overall length sits outside the chain, the way a builder reads it. */}
              <DimLine
                from={pointAlongWall(p, w.id, span.start)}
                to={pointAlongWall(p, w.id, span.end)}
                label={formatLengthWithUnit(wallMeasuredLength(p, w.id), unit)}
                offset={outward * (hasOpenings ? 52 : 22) * mmPerPx}
                mmPerPx={mmPerPx}
              />
            </g>
          );
        })}

      {showDims &&
        p.walls.map((w) => {
          const angle = wallAngleDeg(p, w.id);
          if (angle === null) return null;
          // Square corners are the assumption a reader already makes, so labelling every
          // one of them is clutter that collides with the length dimensions. Only corners
          // that are not square carry a number.
          if (Math.abs(Math.abs(angle) - 90) < 0.5 || Math.abs(angle) < 0.5) return null;
          const corner = nodeById(p, w.a);
          const toCentre = Math.hypot(corner.x - planCentre.x, corner.y - planCentre.y) || 1;
          const inx = (planCentre.x - corner.x) / toCentre;
          const iny = (planCentre.y - corner.y) / toCentre;
          return (
            <text
              key={`${w.id}-angle`}
              data-testid="angle-label"
              x={corner.x + inx * 46 * mmPerPx}
              y={corner.y + iny * 46 * mmPerPx}
              fill={DIM}
              fontSize={10 * mmPerPx}
              fontFamily="Helvetica, Arial, sans-serif"
              textAnchor="middle"
            >
              {formatDeg(angle)}°
            </text>
          );
        })}

      {showLabels &&
        p.walls.map((w) => {
        const { a, b } = wallEnds(p, w.id);
        const len = wallLength(p, w.id) || 1;
        const t = labelOffsetAlongWall(p, w.id) / len;
        return (
          <text
            key={`${w.id}-label`}
            data-testid="wall-label"
            x={a.x + (b.x - a.x) * t}
            y={a.y + (b.y - a.y) * t + 4 * mmPerPx}
            fill={PAPER}
            fontSize={11 * mmPerPx}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="700"
            textAnchor="middle"
            style={{ pointerEvents: "none" }}
          >
            {w.label}
          </text>
        );
      })}

      {/* A loop broken by a numeric edit is shown, never quietly absorbed. */}
      {p.nodes
        .filter((n) => n.openFrom)
        .map((n) => {
          const partner = p.nodes.find((x) => x.id === n.openFrom);
          if (!partner) return null;
          const gap = loopGap(p, p.walls[0]?.id ?? "");
          return (
            <g key={`${n.id}-gap`} data-testid="loop-gap">
              <line
                x1={n.x}
                y1={n.y}
                x2={partner.x}
                y2={partner.y}
                stroke={ALERT}
                strokeWidth={hairline * 2}
                strokeDasharray={`${6 * mmPerPx} ${4 * mmPerPx}`}
              />
              <text
                x={(n.x + partner.x) / 2}
                y={(n.y + partner.y) / 2 - 8 * mmPerPx}
                fill={ALERT}
                fontSize={10 * mmPerPx}
                fontFamily="Helvetica, Arial, sans-serif"
                textAnchor="middle"
              >
                {`open ${formatLengthWithUnit(
                  gap || Math.round(Math.hypot(n.x - partner.x, n.y - partner.y)),
                  unit,
                )}`}
              </text>
            </g>
          );
        })}

      {props.onPickNode &&
        p.nodes.map((n) => (
          <circle
            key={n.id}
            data-testid="node-handle"
            cx={n.x}
            cy={n.y}
            r={5 * mmPerPx}
            fill={highlightIds.includes(n.id) ? ACCENT : PAPER}
            stroke={ACCENT}
            strokeWidth={hairline * 1.5}
            onPointerDown={(e) => props.onNodePointerDown?.(n.id, e)}
            onClick={() => props.onPickNode?.(n.id)}
            style={{ cursor: "grab" }}
          />
        ))}

      {props.overlay}
    </svg>
  );
}

function arcPath(arc: { cx: number; cy: number; r: number; startDeg: number; endDeg: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = arc.cx + arc.r * Math.cos(rad(arc.startDeg));
  const y1 = arc.cy + arc.r * Math.sin(rad(arc.startDeg));
  const x2 = arc.cx + arc.r * Math.cos(rad(arc.endDeg));
  const y2 = arc.cy + arc.r * Math.sin(rad(arc.endDeg));
  const sweep = arc.endDeg > arc.startDeg ? 1 : 0;
  return `M ${x1} ${y1} A ${arc.r} ${arc.r} 0 0 ${sweep} ${x2} ${y2}`;
}
