import {
  setWallAngleDeg,
  setWallLength,
  wallAngleDeg,
  wallHeight,
} from "../model/geometry";
import {
  centrelineForMeasured,
  projectMeasureFrom,
  wallMeasuredLength,
  wallMeasuredSpan,
} from "../model/measure";
import {
  addOpeningAtOffset,
  deleteOpening,
  deleteRoom,
  deleteWall,
  updateOpening,
  updateRoom,
  updateWall,
} from "../model/ops";
import { labelOffsetAlongWall } from "../model/openings";
import { wallOpeningViews } from "../model/sharedOpenings";
import { wallSideNames } from "../model/faces";
import { wallThickness } from "../model/walls";
import { roomArea } from "../model/rooms";
import type { Opening, OpeningKind, Project, Wall } from "../model/types";
import type { Unit } from "../model/units";
import { formatArea, formatLength, parseLength, stepFor } from "../model/units";
import { projectUnit } from "../model/factory";
import { ROOM_TINTS } from "../render/theme";
import { useStore } from "../state/store";

function NumberField({
  label,
  value,
  suffix,
  step,
  onCommit,
}: {
  label: string;
  value: string;
  suffix: string;
  step: number;
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
  const unit = projectUnit(project);
  const num = { suffix: unit, step: stepFor(unit) };

  if (selection.kind === "none") {
    return (
      <aside className="panel">
        <h2>Nothing selected</h2>
        <p className="hint">
          Pick the wall tool and click corner to corner. Hold Alt to break the 15° snap.
          Backspace takes back the last corner, Enter finishes a run, and clicking the first
          corner closes it.
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
          label={LENGTH_LABEL[projectMeasureFrom(project)]}
          {...num}
          value={formatLength(wallMeasuredLength(project, wall.id), unit)}
          onCommit={(v) =>
            apply((p) =>
              setWallLength(p, wall.id, centrelineForMeasured(p, wall.id, parseLength(v, unit))),
            )
          }
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
        <FaceFields wall={wall} unit={unit} />
        <NumberField
          label="Height"
          {...num}
          value={formatLength(wallHeight(project, wall.id), unit)}
          onCommit={(v) => apply((p) => updateWall(p, wall.id, { height: parseLength(v, unit) }))}
        />
        {wall.height !== undefined && (
          <button
            className="link"
            onClick={() => apply((p) => updateWall(p, wall.id, { height: undefined }))}
          >
            Use the project height ({formatLength(project.defaultWallHeight, unit)} {unit})
          </button>
        )}
        <OpeningList wallId={wall.id} wallLabel={wall.label} />

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
    // Offsets read from the same face the wall's own length is measured from.
    const faceStart = wallMeasuredSpan(project, wall.id).start;
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
          {...num}
          value={formatLength(o.offset - faceStart, unit)}
          onCommit={(v) => patch({ offset: parseLength(v, unit) + faceStart })}
        />
        <NumberField
          label="Width"
          {...num}
          value={formatLength(o.width, unit)}
          onCommit={(v) => patch({ width: parseLength(v, unit) })}
        />
        <NumberField
          label="Height"
          {...num}
          value={formatLength(o.height, unit)}
          onCommit={(v) => patch({ height: parseLength(v, unit) })}
        />
        {o.kind !== "door" && (
          <NumberField
            label="Sill above floor"
            {...num}
            value={formatLength(o.sill, unit)}
            onCommit={(v) => patch({ sill: parseLength(v, unit) })}
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
          <strong>{formatArea(roomArea(room))} m²</strong>
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

/**
 * The two faces of a wall, edited on their own. Moving one leaves the other where it is,
 * so correcting the thickness of a wall does not disturb a room already measured against
 * its other side.
 */
function FaceFields({ wall, unit }: { wall: Wall; unit: Unit }) {
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const names = wallSideNames(project, wall.id);
  const step = stepFor(unit);

  return (
    <section className="faces" data-testid="wall-faces">
      <h3>
        Faces <span className="count">{formatLength(wallThickness(wall), unit)} {unit} thick</span>
      </h3>
      {(["left", "right"] as const).map((side) => (
        <NumberField
          key={side}
          label={`${names[side]} face`}
          suffix={unit}
          step={step}
          value={formatLength(wall.offsets[side], unit)}
          onCommit={(v) =>
            apply((p) =>
              updateWall(p, wall.id, {
                offsets: { ...wall.offsets, [side]: Math.max(0, parseLength(v, unit)) },
              }),
            )
          }
        />
      ))}
      <p className="hint">Distance from the wall's centreline to that face.</p>
    </section>
  );
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

const LENGTH_LABEL: Record<string, string> = {
  inside: "Length (inside)",
  centre: "Length (centre)",
  outside: "Length (outside)",
};

const KIND_NAME: Record<OpeningKind, string> = {
  door: "Door",
  window: "Window",
  passage: "Opening",
};

/**
 * Everything fitted into the selected wall, in the order it runs along the wall. Openings
 * belong to a wall, so this is where you look for them — hunting for a small symbol on the
 * plan to click is the wrong way to find a door you already know is there.
 */
function OpeningList({ wallId, wallLabel }: { wallId: string; wallLabel: string }) {
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);

  const unit = projectUnit(project);
  const faceStart = wallMeasuredSpan(project, wallId).start;
  // Includes openings in a wall lying on this one: one door, shown from both sides.
  const openings = wallOpeningViews(project, wallId);

  function add(kind: OpeningKind) {
    let created = "";
    apply((p) => {
      const r = addOpeningAtOffset(p, wallId, labelOffsetAlongWall(p, wallId), kind);
      created = r.id;
      return r.project;
    });
    if (created) select({ kind: "opening", id: created });
  }

  return (
    <section className="openings" data-testid="wall-openings">
      <h3>
        Openings <span className="count">{openings.length}</span>
      </h3>

      {openings.length === 0 && <p className="hint">Nothing in this wall yet.</p>}

      <ul>
        {openings.map((view) => {
          const o = view.opening;
          const otherWall = view.own
            ? null
            : project.walls.find((w) => w.id === o.wallId)?.label;
          return (
            <li key={o.id}>
              <button
                className="opening-row"
                data-testid="opening-row"
                data-shared={view.own ? undefined : "true"}
                onClick={() => select({ kind: "opening", id: o.id })}
              >
                <strong>
                  {KIND_NAME[o.kind]}
                  {otherWall && <em className="shared-tag">shared with wall {otherWall}</em>}
                </strong>
                <span>
                  {formatLength(view.offset - faceStart, unit)} {unit} from {wallLabel} ·{" "}
                  {formatLength(o.width, unit)} × {formatLength(o.height, unit)} {unit}
                  {o.sill > 0 ? ` · sill ${formatLength(o.sill, unit)} ${unit}` : ""}
                </span>
              </button>
              <button
                className="row-delete"
                aria-label={`Delete ${KIND_NAME[o.kind].toLowerCase()}`}
                onClick={() => apply((p) => deleteOpening(p, o.id))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="add-row">
        <button onClick={() => add("door")}>+ Door</button>
        <button onClick={() => add("window")}>+ Window</button>
        <button onClick={() => add("passage")}>+ Opening</button>
      </div>
    </section>
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
