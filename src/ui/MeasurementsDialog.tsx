import { useMemo, useState } from "react";
import { projectUnit } from "../model/factory";
import { previewFromText } from "../model/fromMeasurements";
import { projectMeasureFrom } from "../model/measure";
import { roomArea } from "../model/rooms";
import { formatArea, formatLength, parseLength, stepFor } from "../model/units";
import { PlanSvg } from "../render/PlanSvg";
import { useStore } from "../state/store";

const FACE_WORD: Record<string, string> = {
  inside: "inside faces",
  centre: "centrelines",
  outside: "outside faces",
};

export function MeasurementsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const requestFit = useStore((s) => s.requestFit);

  const unit = projectUnit(project);
  const [text, setText] = useState("");
  const [rightAngles, setRightAngles] = useState(false);
  const [name, setName] = useState("");
  const [thickness, setThickness] = useState(formatLength(100, unit));

  const preview = useMemo(
    () =>
      previewFromText(project, text, rightAngles, {
        thickness: parseLength(Number(thickness) || 0, unit) || 100,
        name,
      }),
    [project, text, rightAngles, thickness, name, unit],
  );

  const built = "result" in preview ? preview.result : null;
  const room = built?.roomId
    ? built.project.rooms.find((r) => r.id === built.roomId)
    : undefined;

  function create() {
    if (!built) return;
    apply(() => built.project);
    if (built.roomId) select({ kind: "room", id: built.roomId });
    // The new walls land clear of existing work, which can be well outside the view.
    requestFit();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Create a room from measurements"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Room from measurements</h2>

        <p className="hint">
          Type each wall and the turn after it, in {unit}:{" "}
          <code>250, 90, 100, 90, 250, 90, 100, 90</code>. A negative turn goes the other
          way, for a room that steps back on itself. Lengths are read as{" "}
          {FACE_WORD[projectMeasureFrom(project)]}, to match the Measure setting.
        </p>

        <label className="field stacked">
          <span>Measurements</span>
          <input
            data-testid="measurements-input"
            autoFocus
            value={text}
            placeholder="250, 90, 100, 90, 250, 90, 100, 90"
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && built) create();
            }}
          />
        </label>

        <label className="field checkbox">
          <input
            type="checkbox"
            aria-label="Every corner is square"
            checked={rightAngles}
            onChange={(e) => setRightAngles(e.currentTarget.checked)}
          />
          <span>Every corner is square — type lengths only</span>
        </label>

        <div className="row">
          <label className="field">
            <span>Name</span>
            <input
              data-testid="room-name-input"
              value={name}
              placeholder="Room"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <label className="field">
            <span>Wall thickness</span>
            <span className="input-wrap">
              <input
                type="number"
                aria-label="Wall thickness"
                step={stepFor(unit)}
                value={thickness}
                onChange={(e) => setThickness(e.currentTarget.value)}
              />
              <em>{unit}</em>
            </span>
          </label>
        </div>

        <div className="preview" data-testid="measurement-preview">
          {built ? (
            <PlanSvg
              project={built.project}
              width={520}
              height={260}
              showRooms
              showDims
            />
          ) : (
            <p className="hint alert" data-testid="measurement-error">
              {"error" in preview ? preview.error : ""}
            </p>
          )}
        </div>

        {built && (
          <p className="readout" data-testid="measurement-readout">
            {built.gap === 0 ? (
              <span>Closes exactly.</span>
            ) : (
              <span className="alert">
                Misses its own start by {formatLength(built.gap, unit)} {unit}.
                {built.roomId ? "" : " No room added, but the walls will be."}
              </span>
            )}
            {room && <span> {formatArea(roomArea(room))} m² of floor.</span>}
          </p>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!built} onClick={create}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
