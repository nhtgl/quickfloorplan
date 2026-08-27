import { deserialize, serialize } from "../file/serialize";
import type { Project } from "../model/types";
import { useStore } from "./store";

const KEY = "quickfloorplan.autosave.v1";

/**
 * A crash net, not storage. The .floorplan.json on disk is the artifact the user owns;
 * this only exists so a refresh or a closed tab does not lose work in progress.
 */
export function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const result = deserialize(raw);
    return result.ok ? result.project : null;
  } catch {
    return null;
  }
}

export function startAutosave(): () => void {
  return useStore.subscribe((s) => {
    try {
      localStorage.setItem(KEY, serialize(s.project));
    } catch {
      // A full or blocked localStorage must not interrupt drawing.
    }
  });
}
