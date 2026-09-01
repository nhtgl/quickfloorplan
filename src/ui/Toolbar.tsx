import { useState } from "react";
import { MeasurementsDialog } from "./MeasurementsDialog";
import { PhotosDialog } from "./PhotosDialog";
import { ExportDialog } from "./ExportDialog";
import { emptyProject } from "../model/factory";
import { formatLength, parseLength, stepFor, type Unit } from "../model/units";
import { projectUnit } from "../model/factory";
import { projectMeasureFrom, type MeasureFrom } from "../model/measure";
import { openProject, saveProject } from "../file/io";
import { useStore, type Tool } from "../state/store";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Pick and edit (V)" },
  { id: "pan", label: "Pan", hint: "Drag to move the view (H). Shift-drag works with any tool." },
  { id: "wall", label: "Wall", hint: "Click corner to corner (W)" },
  { id: "door", label: "Door", hint: "Click a wall (D)" },
  { id: "window", label: "Window", hint: "Click a wall (N)" },
  { id: "passage", label: "Opening", hint: "Archway or hatch (P)" },
  { id: "room", label: "Room", hint: "Outline an area (R)" },
];

export function Toolbar({ onNotify }: { onNotify: (msg: string, bad?: boolean) => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const reset = useStore((s) => s.reset);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [typing, setTyping] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [exporting, setExporting] = useState(false);
  const unit = projectUnit(project);
  const measureFrom = projectMeasureFrom(project);

  async function doOpen() {
    const result = await openProject();
    if (!result) return;
    if (result.ok) {
      reset(result.project);
      onNotify(`Opened ${result.project.name}.`);
    } else {
      onNotify(result.error, true);
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">QuickFloorPlan</div>

      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? "tool on" : "tool"}
            onClick={() => setTool(t.id)}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <label className="field inline">
        <span>Name</span>
        <input
          aria-label="Project name"
          defaultValue={project.name}
          key={project.name}
          onBlur={(e) => apply((p) => ({ ...p, name: e.currentTarget.value }))}
        />
      </label>

      <label className="field inline">
        <span>Units</span>
        <select
          aria-label="Units"
          value={unit}
          onChange={(e) => apply((p) => ({ ...p, units: e.currentTarget.value as Unit }))}
        >
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
      </label>

      <label className="field inline">
        <span>Measure</span>
        <select
          aria-label="Measure walls from"
          value={measureFrom}
          onChange={(e) =>
            apply((p) => ({ ...p, measureFrom: e.currentTarget.value as MeasureFrom }))
          }
          title="Which face the elevation pages draw, and which face a typed room size means. The plan dimensions every face on its own."
        >
          <option value="inside">Inside faces</option>
          <option value="centre">Centrelines</option>
          <option value="outside">Outside faces</option>
        </select>
      </label>

      <label className="field inline">
        <span>Ceiling</span>
        <input
          type="number"
          aria-label="Ceiling height"
          step={stepFor(unit)}
          defaultValue={formatLength(project.defaultWallHeight, unit)}
          key={`${project.defaultWallHeight}-${unit}`}
          onBlur={(e) =>
            apply((p) => ({
              ...p,
              defaultWallHeight: parseLength(Number(e.currentTarget.value), unit),
            }))
          }
        />
        <em>{unit}</em>
      </label>

      <div className="actions">
        <button onClick={undo} title="Undo (Cmd/Ctrl+Z)">Undo</button>
        <button onClick={redo} title="Redo (Shift+Cmd/Ctrl+Z)">Redo</button>
        <button onClick={() => setTyping(true)}>Room from sizes…</button>
        <button onClick={() => setPhotos(true)}>Photos…</button>
        <button onClick={() => reset(emptyProject("Untitled"))}>New</button>
        <button onClick={doOpen}>Open</button>
        <button onClick={() => saveProject(project).catch(() => undefined)}>Save</button>
        <button className="primary" onClick={() => setExporting(true)}>
          Export PDF
        </button>
      </div>
      {typing && <MeasurementsDialog onClose={() => setTyping(false)} />}
      {photos && <PhotosDialog onClose={() => setPhotos(false)} />}
      {exporting && (
        <ExportDialog onClose={() => setExporting(false)} onNotify={onNotify} />
      )}
    </header>
  );
}
