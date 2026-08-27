import { projectWarnings } from "../model/validate";
import { useStore } from "../state/store";

/**
 * Warnings are advisory. Saving and exporting stay available in every state: a plan
 * measured off a tape is inconsistent mid-edit, and a tool that refuses to save until
 * everything is perfect is a tool people abandon.
 */
export function Warnings() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const warnings = projectWarnings(project);
  if (warnings.length === 0) return null;

  return (
    <div className="warnings" data-testid="warnings">
      {warnings.map((w, i) => (
        <button
          key={i}
          className="warning"
          onClick={() => {
            const id = w.targetIds[0];
            if (project.walls.some((x) => x.id === id)) select({ kind: "wall", id });
            else if (project.openings.some((x) => x.id === id)) select({ kind: "opening", id });
            else if (project.rooms.some((x) => x.id === id)) select({ kind: "room", id });
            else select({ kind: "node", id });
          }}
        >
          {w.message}
        </button>
      ))}
    </div>
  );
}
