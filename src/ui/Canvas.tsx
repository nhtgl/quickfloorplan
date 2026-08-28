import { useEffect, useRef, useState } from "react";
import { addOpening, addRoom, commitWallChain, moveNode } from "../model/ops";
import { moveLoop, roomsInLoop } from "../model/loops";
import { snapLoopDelta } from "./loopSnap";
import { projectUnit } from "../model/factory";
import type { Point } from "../model/types";
import { PlanSvg } from "../render/PlanSvg";
import { ACCENT, GUIDE, NOTIONAL } from "../render/theme";
import { formatLengthWithUnit } from "../model/units";
import { useStore } from "../state/store";
import { resolveSnap, type Guide } from "./snapping";
import { useViewport } from "./useViewport";

type Draft = { points: Point[]; cursor: Point | null; guides: Guide[] };

const EMPTY: Draft = { points: [], cursor: null, guides: [] };

export function Canvas({ width, height }: { width: number; height: number }) {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const apply = useStore((s) => s.apply);
  const applyTransient = useStore((s) => s.applyTransient);
  const beginHistoryStep = useStore((s) => s.beginHistoryStep);
  const select = useStore((s) => s.select);
  const setTool = useStore((s) => s.setTool);
  const fitSignal = useStore((s) => s.fitSignal);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [freeAngle, setFreeAngle] = useState(false);
  const dragging = useRef<{ nodeId: string } | null>(null);
  // Dragging a whole run of walls: where the pointer started, and how far the run has
  // been shifted so far, so each move applies only the difference.
  const loopDrag = useRef<{ wallId: string; from: Point; applied: Point } | null>(null);
  const [loopGuides, setLoopGuides] = useState<Guide[]>([]);
  const panning = useRef<{ x: number; y: number } | null>(null);

  const { viewport, viewBox, svgRef, fit, toPlan, zoomAt, zoomBy, panBy } = useViewport(width, height);

  useEffect(() => {
    fit(project);
    // Fit on mount, and whenever something asks. Otherwise the user's pan and zoom are
    // theirs to keep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing a measurement into.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;

      if (e.key === "Alt") setFreeAngle(true);
      if (e.key === "Escape") setDraft(EMPTY);
      if (e.key === "Enter" && draft.points.length >= 2) commitDraft();
      if (e.key.toLowerCase() === "f") fit(project);
      if (e.key === "Backspace" || e.key === "Delete") {
        if (draft.points.length === 0) return;
        // Backspace navigates back in some browsers, so this has to be claimed.
        e.preventDefault();
        setDraft((d) => ({ ...d, points: d.points.slice(0, -1) }));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setFreeAngle(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  function commitDraft() {
    if (tool === "wall" && draft.points.length >= 2) {
      apply((p) => commitWallChain(p, draft.points));
    }
    if (tool === "room" && draft.points.length >= 3) {
      let newId = "";
      apply((p) => {
        const r = addRoom(p, draft.points);
        newId = r.id;
        return r.project;
      });
      if (newId) select({ kind: "room", id: newId });
      setTool("select");
    }
    setDraft(EMPTY);
  }

  const origin = draft.points.length ? draft.points[draft.points.length - 1] : null;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || e.shiftKey || tool === "pan") {
      panning.current = { x: e.clientX, y: e.clientY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const raw = toPlan(e.clientX, e.clientY);
    const { point: pt } = resolveSnap({
      project,
      raw,
      origin,
      freeAngle,
      draftPoints: draft.points,
      mmPerPx: viewport.mmPerPx,
    });

    if (tool === "wall" || tool === "room") {
      const first = draft.points[0];
      const closing =
        first && draft.points.length >= 2 && Math.hypot(pt.x - first.x, pt.y - first.y) < 1;
      if (closing) {
        const points = tool === "wall" ? [...draft.points, first] : draft.points;
        if (tool === "wall") {
          apply((p) => commitWallChain(p, points));
          setDraft(EMPTY);
        } else {
          commitDraft();
        }
        return;
      }
      setDraft((d) => ({ ...d, points: [...d.points, pt] }));
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (panning.current) {
      panBy(e.clientX - panning.current.x, e.clientY - panning.current.y);
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (dragging.current) {
      const raw = toPlan(e.clientX, e.clientY);
      const id = dragging.current.nodeId;
      // Transient: the whole drag is one undo step, not one per pixel of movement.
      applyTransient((p) => moveNode(p, id, raw));
      return;
    }

    if (loopDrag.current) {
      const drag = loopDrag.current;
      const raw = toPlan(e.clientX, e.clientY);
      // How far the run still has to move from where it already is. Snapping is judged
      // against the run's present position, so the step has to be relative to it too —
      // measuring from the start of the drag would count the movement already applied
      // twice over, and the snap would land short by exactly that much.
      const wanted = { x: raw.x - drag.from.x, y: raw.y - drag.from.y };
      const pending = {
        x: wanted.x - drag.applied.x,
        y: wanted.y - drag.applied.y,
      };
      const snapped = snapLoopDelta({
        project,
        wallId: drag.wallId,
        rawDelta: pending,
        mmPerPx: viewport.mmPerPx,
      });
      drag.applied = {
        x: drag.applied.x + snapped.delta.x,
        y: drag.applied.y + snapped.delta.y,
      };
      setLoopGuides(snapped.guides);
      if (snapped.delta.x !== 0 || snapped.delta.y !== 0) {
        applyTransient((p) => moveLoop(p, drag.wallId, snapped.delta.x, snapped.delta.y));
      }
      return;
    }
    if (draft.points.length) {
      const raw = toPlan(e.clientX, e.clientY);
      setDraft((d) => {
        const snap = resolveSnap({
          project,
          raw,
          origin,
          freeAngle,
          draftPoints: d.points,
          mmPerPx: viewport.mmPerPx,
        });
        return { ...d, cursor: snap.point, guides: snap.guides };
      });
    }
  }

  function onPointerUp() {
    panning.current = null;
    dragging.current = null;

    loopDrag.current = null;
    setLoopGuides([]);
  }

  /** Begin dragging the whole run of walls that `wallId` belongs to. */
  function beginLoopDrag(wallId: string, e: React.PointerEvent) {
    if (tool !== "select" || e.button !== 0 || e.shiftKey) return;
    e.stopPropagation();
    beginHistoryStep();
    loopDrag.current = {
      wallId,
      from: toPlan(e.clientX, e.clientY),
      applied: { x: 0, y: 0 },
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onWheel(e: React.WheelEvent) {
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 1 / 1.1);
  }

  const pickOpeningTool = tool === "door" || tool === "window" || tool === "passage";

  const overlay = (
    <g data-testid="draft">
      {loopGuides.map((g) => (
        <line
          key={`loop-${g.axis}-${g.from.x}-${g.from.y}`}
          data-testid="align-guide"
          data-axis={g.axis}
          x1={g.axis === "x" ? g.from.x : g.from.x - 40_000}
          y1={g.axis === "x" ? g.from.y - 40_000 : g.from.y}
          x2={g.axis === "x" ? g.from.x : g.from.x + 40_000}
          y2={g.axis === "x" ? g.from.y + 40_000 : g.from.y}
          stroke={GUIDE}
          strokeWidth={viewport.mmPerPx}
          strokeDasharray={`${5 * viewport.mmPerPx} ${5 * viewport.mmPerPx}`}
        />
      ))}
      {draft.cursor &&
        draft.guides.map((g) => (
          <g key={`${g.axis}-${g.from.x}-${g.from.y}`} data-testid="align-guide" data-axis={g.axis}>
            <line
              x1={g.from.x}
              y1={g.from.y}
              x2={draft.cursor!.x}
              y2={draft.cursor!.y}
              stroke={GUIDE}
              strokeWidth={viewport.mmPerPx}
              strokeDasharray={`${5 * viewport.mmPerPx} ${5 * viewport.mmPerPx}`}
            />
            <circle
              cx={g.from.x}
              cy={g.from.y}
              r={3 * viewport.mmPerPx}
              fill="none"
              stroke={GUIDE}
              strokeWidth={viewport.mmPerPx}
            />
          </g>
        ))}
      {draft.points.length > 0 && (
        <polyline
          points={[...draft.points, ...(draft.cursor ? [draft.cursor] : [])]
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill={tool === "room" ? "rgba(18,102,212,0.08)" : "none"}
          stroke={tool === "room" ? NOTIONAL : ACCENT}
          strokeWidth={viewport.mmPerPx * 2}
          strokeDasharray={`${8 * viewport.mmPerPx} ${5 * viewport.mmPerPx}`}
        />
      )}
      {draft.points.map((p, i) => (
        <circle
          key={i}
          data-testid="draft-point"
          cx={p.x}
          cy={p.y}
          r={4 * viewport.mmPerPx}
          fill={ACCENT}
        />
      ))}
      {origin && draft.cursor && (
        <text
          data-testid="draft-length"
          x={(origin.x + draft.cursor.x) / 2}
          y={(origin.y + draft.cursor.y) / 2 - 10 * viewport.mmPerPx}
          fill={ACCENT}
          fontSize={12 * viewport.mmPerPx}
          fontFamily="Helvetica, Arial, sans-serif"
          textAnchor="middle"
        >
          {formatLengthWithUnit(
            Math.round(Math.hypot(draft.cursor.x - origin.x, draft.cursor.y - origin.y)),
            projectUnit(project),
          )}
        </text>
      )}
    </g>
  );

  return (
    <div onWheel={onWheel} style={{ lineHeight: 0, position: "relative" }}>
      <PlanSvg
        project={project}
        width={width}
        height={height}
        viewBox={viewBox}
        mmPerPx={viewport.mmPerPx}
        highlightIds={selection.kind === "none" ? [] : [selection.id]}
        svgRef={(el) => {
          svgRef.current = el;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPickWall={(id) => {
          if (pickOpeningTool) {
            const kind = tool as "door" | "window" | "passage";
            let created = "";
            apply((p) => {
              const r = addOpening(p, id, lastPointerPlan.current ?? { x: 0, y: 0 }, kind);
              created = r.id;
              return r.project;
            });
            if (created) select({ kind: "opening", id: created });
            setTool("select");
            return;
          }
          if (tool === "select") select({ kind: "wall", id });
        }}
        onWallPointerDown={beginLoopDrag}
        onRoomPointerDown={(roomId, e) => {
          // Grab the run of walls this room sits in, so its tint and its walls move
          // together rather than the fill sliding off the walls.
          const wall = project.walls.find((w) =>
            roomsInLoop(project, w.id).includes(roomId),
          );
          if (wall) beginLoopDrag(wall.id, e);
        }}
        onPickOpening={(id) => tool === "select" && select({ kind: "opening", id })}
        onPickRoom={(id) => tool === "select" && select({ kind: "room", id })}
        onPickNode={tool === "select" ? (id) => select({ kind: "node", id }) : undefined}
        onNodePointerDown={
          tool === "select"
            ? (id, e) => {
                // A click fires after pointerup, so starting the drag there would set the
                // flag the moment it had just been cleared and the corner would stay
                // stuck to the pointer. It has to begin on pointerdown.
                e.stopPropagation();
                select({ kind: "node", id });
                beginHistoryStep();
                dragging.current = { nodeId: id };
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              }
            : undefined
        }
        overlay={overlay}
        style={{
          cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair",
          display: "block",
        }}
      />
      <PointerTracker onMove={(pt) => (lastPointerPlan.current = pt)} toPlan={toPlan} />

      <div className="viewctl" data-testid="view-controls">
        <button aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1.25)}>
          −
        </button>
        <button aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1 / 1.25)}>
          +
        </button>
        <button
          aria-label="Fit plan to view"
          title="Fit the whole plan in view (F)"
          onClick={() => fit(project)}
        >
          Fit
        </button>
      </div>
    </div>
  );
}

/** Keeps the last cursor position in plan mm so a wall click can place an opening there. */
const lastPointerPlan = { current: null as Point | null };

function PointerTracker({
  onMove,
  toPlan,
}: {
  onMove: (p: Point) => void;
  toPlan: (x: number, y: number) => Point;
}) {
  useEffect(() => {
    const handler = (e: PointerEvent) => onMove(toPlan(e.clientX, e.clientY));
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [onMove, toPlan]);
  return null;
}
