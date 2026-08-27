import type { Project } from "../model/types";
import { deserialize, serialize } from "./serialize";

const EXT = ".floorplan.json";

type Handle = { createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> };

let currentHandle: Handle | null = null;

function fileName(p: Project): string {
  const safe = p.name.replace(/[^\w\- ]+/g, "").trim() || "floorplan";
  return `${safe}${EXT}`;
}

function hasFsAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

function downloadFallback(p: Project): void {
  const blob = new Blob([serialize(p)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(p);
  a.click();
  URL.revokeObjectURL(url);
}

/** Save to the handle already in use, or prompt if there is not one yet. */
export async function saveProject(p: Project, forceNew = false): Promise<void> {
  if (!hasFsAccess()) {
    downloadFallback(p);
    return;
  }
  if (!currentHandle || forceNew) {
    const picker = (window as unknown as {
      showSaveFilePicker: (o: unknown) => Promise<Handle>;
    }).showSaveFilePicker;
    currentHandle = await picker({
      suggestedName: fileName(p),
      types: [{ description: "QuickFloorPlan project", accept: { "application/json": [EXT] } }],
    });
  }
  const writable = await currentHandle.createWritable();
  await writable.write(serialize(p));
  await writable.close();
}

export function hasSaveTarget(): boolean {
  return currentHandle !== null;
}

export async function openProject(): Promise<
  { ok: true; project: Project } | { ok: false; error: string } | null
> {
  let text: string;
  if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
    const picker = (window as unknown as {
      showOpenFilePicker: (o: unknown) => Promise<(Handle & { getFile: () => Promise<File> })[]>;
    }).showOpenFilePicker;
    let handles;
    try {
      handles = await picker({
        types: [{ description: "QuickFloorPlan project", accept: { "application/json": [EXT] } }],
      });
    } catch {
      return null; // user dismissed the picker
    }
    const file = await handles[0].getFile();
    text = await file.text();
    currentHandle = handles[0];
  } else {
    const picked = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!picked) return null;
    text = await picked.text();
    currentHandle = null;
  }
  return deserialize(text);
}
