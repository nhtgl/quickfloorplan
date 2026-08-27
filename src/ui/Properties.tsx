import {
  setWallAngleDeg,
  setWallLength,
  wallAngleDeg,
  wallHeight,
  wallLength,
} from "../model/geometry";
import {
  deleteOpening,
  deleteRoom,
  deleteWall,
  updateOpening,
  updateRoom,
  updateWall,
} from "../model/ops";
import { roomArea } from "../model/rooms";
import type { Opening, Project } from "../model/types";
import { mm2ToM2, mmToM, mToMm } from "../model/units";
import { ROOM_TINTS } from "../render/theme";
import { useStore } from "../state/store";

function NumberField({
  label,
  value,
  suffix = "m",
  step = 0.01,
  onCommit,
}: {
  label: string;
  value: string;
  suffix?: string;
  step?: number;
  onCommit: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input
          type="number"
          aria-label={label}
          step={step}
          defaultValue={value}
          key={value}
          onBlur={(e) => onCommit(Number(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <em>{suffix}</em>
      </span>
    </label>
  );
}

export function Properties() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);

  if (selection.kind === "none") {
    return (
      <aside className="panel">
        <h2>Nothing selected</h2>
        <p className="hint">
          Pick the wall tool and click corner to corner. Hold Alt to break the 15° snap.
          Press Enter to finish a run, or click the first corner to close it.
        </p>
      </aside>
    );
  }

  if (selection.kind === "wall") {
    const wall = project.walls.find((w) => w.id === selection.id);
    if (!wall) return null;
    const angle = wallAngleDeg(project, wall.id);
    return (
      <aside className="panel">
        <h2>Wall {wall.label}</h2>
        <NumberField
          label="Length"
          value={mmToM(wallLength(project, wall.id))}
          onCommit={(v) => apply((p) => setWallLength(p, wall.id, mToMm(v)))}
        />
        {angle !== null && (
          <NumberField
            label="Angle from previous"
            suffix="°"
            step={0.5}
            value={angle.toFixed(1)}
            onCommit={(v) => apply((p) => setWallAngleDeg(p, wall.id, v))}
          />
        )}
        <NumberField
          label="Thickness"
          value={mmToM(wall.thickness)}
          onCommit={(v) => apply((p) => updateWall(p, wall.id, { thickness: mToMm(v) }))}
        />
        <NumberField
          label="Height"
          value={mmToM(wallHeight(project, wall.id))}
          onCommit={(v) => apply((p) => updateWall(p, wall.id, { height: mToMm(v) }))}
        />
        {wall.height !== undefined && (
          <button
            className="link"
            onClick={() => apply((p) => updateWall(p, wall.id, { height: undefined }))}
          >
            Use the project height ({mmToM(project.defaultWallHeight)} m)
          </button>
        )}
        <button
          className="danger"
          onClick={() => {
            apply((p) => deleteWall(p, wall.id));
            select({ kind: "none" });
          }}
        >
          Delete wall
        </button>
      </aside>
    );
  }

  if (selection.kind === "opening") {
    const o = project.openings.find((x) => x.id === selection.id);
    if (!o) return null;
    const wall = project.walls.find((w) => w.id === o.wallId)!;
    const patch = (d: Partial<Opening>) => apply((p) => updateOpening(p, o.id, d));
    return (
      <aside className="panel">
        <h2>
          {o.kind === "passage" ? "Opening" : o.kind[0].toUpperCase() + o.kind.slice(1)} on
          wall {wall.label}
        </h2>
        <label className="field">
          <span>Type</span>
          <select
            aria-label="Type"
            value={o.kind}
            onChange={(e) =>
              patch({
                kind: e.currentTarget.value as Opening["kind"],
                ...(e.currentTarget.value === "door"
                  ? { hinge: o.hinge ?? "a", swing: o.swing ?? "in", sill: 0 }
                  : {}),
              })
            }
          >
            <option value="door">Door</option>
            <option value="window">Window</option>
            <option value="passage">Opening / hatch</option>
          </select>
        </label>
        <NumberField
          label={`From end ${wall.label} (to centre)`}
          value={mmToM(o.offset)}
          onCommit={(v) => patch({ offset: mToMm(v) })}
        />
        <NumberField label="Width" value={mmToM(o.width)} onCommit={(v) => patch({ width: mToMm(v) })} />
        <NumberField label="Height" value={mmToM(o.height)} onCommit={(v) => patch({ height: mToMm(v) })} />
        {o.kind !== "door" && (
          <NumberField
            label="Sill above floor"
            value={mmToM(o.sill)}
            onCommit={(v) => patch({ sill: mToMm(v) })}
          />
        )}
        {o.kind === "door" && (
          <div className="field">
            <span>Swing</span>
            <div className="swing-grid">
              {(["a", "b"] as const).map((hinge) =>
                (["in", "out"] as const).map((swing) => (
                  <button
                    key={`${hinge}${swing}`}
                    className={o.hinge === hinge && o.swing === swing ? "swing on" : "swing"}
                    onClick={() => patch({ hinge, swing })}
                    title={`Hinge at end ${hinge === "a" ? wall.label : "far"}`}
                  >
                    <SwingIcon hinge={hinge} swing={swing} />
                  </button>
                )),
              )}
            </div>
          </div>
        )}
        <button
          className="danger"
          onClick={() => {
            apply((p) => deleteOpening(p, o.id));
            select({ kind: "none" });
          }}
        >
          Delete
        </button>
      </aside>
    );
  }

  if (selection.kind === "room") {
    const room = project.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    return (
      <aside className="panel">
        <h2>Room</h2>
        <label className="field">
          <span>Name</span>
          <input
            aria-label="Name"
            defaultValue={room.name}
            key={room.name}
            onBlur={(e) => apply((p) => updateRoom(p, room.id, { name: e.currentTarget.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <div className="field">
          <span>Area</span>
          <strong>{mm2ToM2(roomArea(room))} m²</strong>
        </div>
        <div className="field">
          <span>Tint</span>
          <div className="tints">
            {ROOM_TINTS.map((t) => (
              <button
                key={t}
                aria-label={`Tint ${t}`}
                className={room.tint === t ? "tint on" : "tint"}
                style={{ background: t }}
                onClick={() => apply((p) => updateRoom(p, room.id, { tint: t }))}
              />
            ))}
          </div>
        </div>
        <button
          className="danger"
          onClick={() => {
            apply((p) => deleteRoom(p, room.id));
            select({ kind: "none" });
          }}
        >
          Delete room
        </button>
      </aside>
    );
  }

  return <NodePanel project={project} nodeId={selection.id} />;
}

function NodePanel({ project, nodeId }: { project: Project; nodeId: string }) {
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return (
    <aside className="panel">
      <h2>Corner</h2>
      <p className="hint">Drag it to move both walls that meet here.</p>
      {node.openFrom && (
        <p className="hint alert">
          This corner came apart from its partner when a measurement was typed in. Drag it
          back onto the other end to close the loop.
        </p>
      )}
    </aside>
  );
}

function SwingIcon({ hinge, swing }: { hinge: "a" | "b"; swing: "in" | "out" }) {
  const left = hinge === "a";
  const up = swing === "in";
  const hx = left ? 4 : 28;
  const ex = left ? 28 : 4;
  const ey = up ? 4 : 28;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <line x1="4" y1="16" x2="28" y2="16" stroke="#999" strokeWidth="2" />
      <path
        d={`M ${ex} 16 A 24 24 0 0 ${left === up ? 0 : 1} ${hx} ${ey}`}
        fill="none"
        stroke="#1266d4"
        strokeWidth="1.5"
      />
      <line x1={hx} y1="16" x2={hx} y2={ey} stroke="#1266d4" strokeWidth="2.5" />
    </svg>
  );
}
