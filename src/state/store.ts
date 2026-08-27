import { create } from "zustand";
import { emptyProject } from "../model/factory";
import type { Project } from "../model/types";

export const UNDO_LIMIT = 50;

export type Tool = "select" | "wall" | "door" | "window" | "passage" | "room";

export type Selection =
  | { kind: "none" }
  | { kind: "wall"; id: string }
  | { kind: "node"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "room"; id: string };

type State = {
  project: Project;
  past: Project[];
  future: Project[];
  tool: Tool;
  selection: Selection;
  apply: (fn: (p: Project) => Project) => void;
  reset: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  setTool: (t: Tool) => void;
  select: (s: Selection) => void;
};

export const useStore = create<State>((set) => ({
  project: emptyProject("Untitled"),
  past: [],
  future: [],
  tool: "wall",
  selection: { kind: "none" },

  apply: (fn) =>
    set((s) => {
      const next = fn(s.project);
      // A no-op edit should not cost the user an undo step.
      if (next === s.project) return s;
      return {
        project: next,
        past: [...s.past, s.project].slice(-UNDO_LIMIT),
        future: [],
      };
    }),

  reset: (p) => set({ project: p, past: [], future: [], selection: { kind: "none" } }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      return {
        project: s.past[s.past.length - 1],
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        selection: { kind: "none" },
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      return {
        project: s.future[0],
        past: [...s.past, s.project].slice(-UNDO_LIMIT),
        future: s.future.slice(1),
        selection: { kind: "none" },
      };
    }),

  setTool: (tool) => set({ tool, selection: { kind: "none" } }),
  select: (selection) => set({ selection }),
}));
