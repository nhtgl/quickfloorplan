import { describe, it, expect, beforeEach } from "vitest";
import { emptyProject } from "../model/factory";
import { UNDO_LIMIT, useStore } from "./store";

beforeEach(() => useStore.getState().reset(emptyProject("t")));

const rename = (name: string) => useStore.getState().apply((p) => ({ ...p, name }));

describe("store history", () => {
  it("undo restores the previous project", () => {
    rename("one");
    expect(useStore.getState().project.name).toBe("one");
    useStore.getState().undo();
    expect(useStore.getState().project.name).toBe("t");
  });

  it("redo reapplies what undo took back", () => {
    rename("one");
    useStore.getState().undo();
    useStore.getState().redo();
    expect(useStore.getState().project.name).toBe("one");
  });

  it("a fresh edit after undo clears the redo stack", () => {
    rename("one");
    useStore.getState().undo();
    rename("two");
    useStore.getState().redo();
    expect(useStore.getState().project.name).toBe("two");
  });

  it("caps the undo stack", () => {
    for (let i = 0; i < UNDO_LIMIT + 20; i += 1) rename(`n${i}`);
    for (let i = 0; i < UNDO_LIMIT + 20; i += 1) useStore.getState().undo();
    // The oldest states fell off the end, so we cannot get back to "t".
    expect(useStore.getState().project.name).not.toBe("t");
    expect(useStore.getState().past).toHaveLength(0);
  });

  it("undo on an empty history is a no-op rather than a crash", () => {
    useStore.getState().undo();
    expect(useStore.getState().project.name).toBe("t");
  });

  it("an apply that returns the same project does not add history", () => {
    useStore.getState().apply((p) => p);
    expect(useStore.getState().past).toHaveLength(0);
  });
});
