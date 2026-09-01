import { wallById, wallHeight } from "../model/geometry";
import { projectUnit } from "../model/factory";
import { wallFaceSign, wallSpanForSide } from "../model/measure";
import { wallDimensionChain } from "../model/openings";
import { wallOpeningViews } from "../model/sharedOpenings";
import type { Project, WallId } from "../model/types";
import { formatLengthWithUnit } from "../model/units";
import { DimLine } from "./dimensions";
import { fitViewBox } from "./bounds";
import { ACCENT, ALERT, DIM, INK, PAPER, WALL } from "./theme";

export type ElevationSvgProps = {
  project: Project;
  wallId: WallId;
  width: number;
  height: number;
  /** +1 for the left-hand face, -1 for the right. Defaults to the measured face. */
  side?: number;
  highlightIds?: string[];
  alertIds?: string[];
  svgRef?: (el: SVGSVGElement | null) => void;
  onPickOpening?: (id: string) => void;
  style?: React.CSSProperties;
};

const KIND_LABEL: Record<string, string> = {
  door: "Door",
  window: "Window",
  passage: "Opening",
};

/**
 * One wall seen face on. Elevation coordinates run x along the wall from end a and
 * y up from the floor, so the SVG flips y to keep the floor at the bottom.
 */
export function ElevationSvg(props: ElevationSvgProps) {
  const { project: p, wallId, width, height, highlightIds = [], alertIds = [] } = props;
  const wall = wallById(p, wallId);
  // The drawing shows the measured face, so x runs from that face's start, not the node.
  const rawSide = props.side ?? wallFaceSign(p, wallId);
  const side = rawSide === 0 ? 1 : rawSide;
  const span = wallSpanForSide(p, wallId, side);
  const len = span.end - span.start;
  // Standing on the far side of a wall puts its two ends the other way round, so the
  // right-hand face is drawn mirrored. Otherwise the page would show a reflection of
  // what the person holding the tape is looking at.
  const along = (centrelineDistance: number) =>
    side < 0 ? span.end - centrelineDistance : centrelineDistance - span.start;
  const h = wallHeight(p, wallId);
  // Includes the openings of any wall lying on this one, so a door between two rooms
  // shows on both rooms' elevations without being stored twice.
  const openings = wallOpeningViews(p, wallId);
  const unit = projectUnit(p);
  const chain = wallDimensionChain(p, wallId, side);

  const { viewBox, mmPerPx } = fitViewBox(
    { minX: 0, minY: -h, maxX: len, maxY: 0 },
    width,
    height,
    0.18,
  );
  const hairline = mmPerPx;
  // Elevation y is measured up from the floor; SVG y grows downward.
  const up = (y: number) => -y;

  return (
    <svg
      ref={props.svgRef}
      data-testid="elevation-svg"
      data-wall-label={wall.label}
      width={width}
      height={height}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: PAPER, ...props.style }}
    >
      <rect
        data-testid="wall-face"
        x={0}
        y={up(h)}
        width={len}
        height={h}
        fill="#f6f6f6"
        stroke={WALL}
        strokeWidth={hairline * 2}
      />

      {openings.map((view) => {
        const o = view.opening;
        // Mirroring swaps which end of the opening comes first, so take the leftmost.
        const ends = [
          along(Math.round(view.offset - o.width / 2)),
          along(Math.round(view.offset + o.width / 2)),
        ];
        const r = { x: Math.min(...ends), y: o.sill, w: o.width, h: o.height };
        const alert = alertIds.includes(o.id);
        const selected = highlightIds.includes(o.id);
        const colour = alert ? ALERT : selected ? ACCENT : WALL;
        return (
          <g key={o.id} data-testid="elevation-opening" data-opening-kind={o.kind}>
            <rect
              x={r.x}
              y={up(r.y + r.h)}
              width={r.w}
              height={r.h}
              fill={PAPER}
              stroke={colour}
              strokeWidth={hairline * 2}
              onClick={() => props.onPickOpening?.(o.id)}
              style={{ cursor: props.onPickOpening ? "pointer" : undefined }}
            />
            <text
              x={r.x + r.w / 2}
              y={up(r.y + r.h / 2) + 6 * mmPerPx}
              fill={DIM}
              fontSize={10 * mmPerPx}
              fontFamily="Helvetica, Arial, sans-serif"
              textAnchor="middle"
              style={{ pointerEvents: "none" }}
            >
              {KIND_LABEL[o.kind]}
            </text>
            <DimLine
              from={{ x: r.x + r.w, y: up(r.y) }}
              to={{ x: r.x + r.w, y: up(r.y + r.h) }}
              label={formatLengthWithUnit(r.h, unit)}
              offset={14 * mmPerPx}
              mmPerPx={mmPerPx}
            />
            {r.y > 0 && (
              <DimLine
                from={{ x: r.x, y: up(0) }}
                to={{ x: r.x, y: up(r.y) }}
                label={`sill ${formatLengthWithUnit(r.y, unit)}`}
                offset={-20 * mmPerPx}
                mmPerPx={mmPerPx}
              />
            )}
          </g>
        );
      })}

      {/* Setting-out chain: corner, opening, solid, opening, corner — tiling the wall. */}
      {chain.length > 1 &&
        chain.map((seg) => (
          <DimLine
            key={seg.start}
            data-kind={seg.kind}
            from={{ x: along(seg.start), y: up(0) }}
            to={{ x: along(seg.end), y: up(0) }}
            label={formatLengthWithUnit(Math.round(seg.end - seg.start), unit)}
            // A mirrored drawing runs the chain right to left, which flips the side its
            // dimension line falls on. Negate it so it stays below the floor either way.
            offset={(side < 0 ? -26 : 26) * mmPerPx}
            mmPerPx={mmPerPx}
            color={seg.kind === "opening" ? ACCENT : undefined}
          />
        ))}

      {/* Overall length outside the chain. */}
      <DimLine
        from={{ x: 0, y: up(0) }}
        to={{ x: len, y: up(0) }}
        label={formatLengthWithUnit(len, unit)}
        offset={(chain.length > 1 ? 62 : 26) * mmPerPx}
        mmPerPx={mmPerPx}
      />
      <DimLine
        from={{ x: 0, y: up(h) }}
        to={{ x: 0, y: up(0) }}
        label={formatLengthWithUnit(h, unit)}
        offset={40 * mmPerPx}
        mmPerPx={mmPerPx}
      />
      <text
        data-testid="floor-note"
        x={len / 2}
        y={up(0) + (chain.length > 1 ? 96 : 60) * mmPerPx}
        fill={INK}
        fontSize={10 * mmPerPx}
        fontFamily="Helvetica, Arial, sans-serif"
        textAnchor="middle"
      >
        Floor
      </text>
    </svg>
  );
}
