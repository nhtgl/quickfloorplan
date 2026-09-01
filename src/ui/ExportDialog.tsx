import { useState } from "react";
import { exportPdf, pdfFileName } from "../export/pdf";
import { pageTitles } from "../export/pageTitles";
import { wallSideNames } from "../model/faces";
import { useStore } from "../state/store";
import type { Wall } from "../model/types";

type Choice = "left" | "right" | "both";

function choiceOf(wall: Wall, fallback: Choice): Choice {
  return wall.elevationFace ?? fallback;
}

export function ExportDialog({
  onClose,
  onNotify,
}: {
  onClose: () => void;
  onNotify: (message: string, bad?: boolean) => void;
}) {
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const [busy, setBusy] = useState(false);

  // What an unset wall will actually export, so the dialog shows the truth rather than
  // an empty choice the user has to guess at.
  const measured = project.measureFrom === "outside" ? "right" : "left";
  const titles = pageTitles(project);

  function setAll(choice: Choice) {
    apply((p) => ({
      ...p,
      walls: p.walls.map((w) => ({ ...w, elevationFace: choice })),
      updatedAt: new Date().toISOString(),
    }));
  }

  function setOne(id: string, choice: Choice) {
    apply((p) => ({
      ...p,
      walls: p.walls.map((w) => (w.id === id ? { ...w, elevationFace: choice } : w)),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function run() {
    setBusy(true);
    try {
      const blob = await exportPdf(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName(project);
      a.click();
      URL.revokeObjectURL(url);
      onNotify(`Exported ${titles.length} pages.`);
      onClose();
    } catch (err) {
      onNotify(`Could not export: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Export PDF"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Export PDF</h2>
        <p className="hint">
          Each wall gets an elevation page. Choose which face of it to draw — the side you
          measured, or both, which a wall between two rooms usually wants. Openings appear
          on whichever side you pick, and the drawing is mirrored when it shows the far
          face, so the page matches what you would see standing there.
        </p>

        <div className="modal-actions left">
          <span className="hint">Set every wall to</span>
          {(["left", "right", "both"] as const).map((c) => (
            <button key={c} onClick={() => setAll(c)}>
              {c === "both" ? "Both faces" : c === "left" ? "Left face" : "Right face"}
            </button>
          ))}
        </div>

        <ul className="wall-faces-list">
          {project.walls.map((wall) => {
            const names = wallSideNames(project, wall.id);
            const current = choiceOf(wall, measured);
            return (
              <li key={wall.id} data-testid="export-wall-row">
                <strong>Wall {wall.label}</strong>
                <div className="choices">
                  {(
                    [
                      ["left", names.left],
                      ["right", names.right],
                      ["both", "Both"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={current === value ? "choice on" : "choice"}
                      aria-pressed={current === value}
                      aria-label={`Wall ${wall.label}: ${label}`}
                      onClick={() => setOne(wall.id, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="readout" data-testid="export-page-count">
          {titles.length} pages: the plan, a blank plan to sketch on,{" "}
          {titles.length - 2 - (project.photos?.length ?? 0)} elevations
          {project.photos?.length ? `, and ${project.photos.length} photos` : ""}.
        </p>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={run}>
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
