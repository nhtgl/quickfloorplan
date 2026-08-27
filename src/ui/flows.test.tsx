import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { emptyProject } from "../model/factory";
import { loopGap, wallLength } from "../model/geometry";
import { roomArea } from "../model/rooms";
import { useStore } from "../state/store";

/** Click at a plan position, going through the SVG's own coordinate mapping. */
function clickPlan(x: number, y: number) {
  const svg = screen.getByTestId("plan-svg");
  fireEvent.pointerDown(svg, { clientX: x, clientY: y, button: 0 });
}

beforeEach(() => {
  localStorage.clear();
  act(() => useStore.getState().reset(emptyProject("Test flat")));
  // jsdom gives every element a zero-sized box, so the canvas needs a usable size.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 900, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 600, configurable: true });
});

describe("drawing walls", () => {
  it("draws a four-wall closed rectangle that reports no gap", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));

    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 400);
    clickPlan(200, 150); // back onto the first corner closes the loop

    const p = useStore.getState().project;
    expect(p.walls).toHaveLength(4);
    expect(p.walls.map((w) => w.label)).toEqual(["A", "B", "C", "D"]);
    expect(loopGap(p, p.walls[0].id)).toBe(0);
  });

  it("shares corner nodes rather than duplicating them", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 150);

    const p = useStore.getState().project;
    // Three corners, not six endpoints.
    expect(p.nodes).toHaveLength(3);
  });
});

describe("editing a wall by typing", () => {
  it("applies a typed length to the model", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    const input = await screen.findByLabelText(/Length/);
    await userEvent.clear(input);
    await userEvent.type(input, "4.20");
    fireEvent.blur(input);

    expect(wallLength(useStore.getState().project, wallId)).toBe(4200);
  });
});

describe("openings", () => {
  it("places a door on a clicked wall and edits its width", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    await userEvent.click(screen.getByRole("button", { name: "Door" }));
    fireEvent.click(screen.getAllByTestId("wall")[0]);

    let p = useStore.getState().project;
    expect(p.openings).toHaveLength(1);
    expect(p.openings[0].kind).toBe("door");
    expect(p.openings[0].sill).toBe(0);

    const openingId = p.openings[0].id;
    act(() =>
      useStore.getState().apply((proj) => ({
        ...proj,
        openings: proj.openings.map((o) => (o.id === openingId ? { ...o, width: 800 } : o)),
      })),
    );
    p = useStore.getState().project;
    expect(p.openings[0].width).toBe(800);
  });
});

describe("rooms", () => {
  it("outlines two rooms that share an edge with no wall behind it", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 400);
    clickPlan(200, 150);

    await userEvent.click(screen.getByRole("button", { name: "Room" }));
    clickPlan(200, 150);
    clickPlan(400, 150);
    clickPlan(400, 400);
    clickPlan(200, 400);
    fireEvent.keyDown(window, { key: "Enter" });

    await userEvent.click(screen.getByRole("button", { name: "Room" }));
    clickPlan(400, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(400, 400);
    fireEvent.keyDown(window, { key: "Enter" });

    const p = useStore.getState().project;
    expect(p.rooms).toHaveLength(2);
    expect(roomArea(p.rooms[0])).toBeGreaterThan(0);
    expect(roomArea(p.rooms[1])).toBeGreaterThan(0);
    // Adjacent, not overlapping — the whole point of decoupling rooms from walls.
    expect(screen.queryByText(/overlap/)).toBeNull();
  });
});

describe("undo", () => {
  it("takes back the last wall run", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(useStore.getState().project.walls).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(useStore.getState().project.walls).toHaveLength(0);
  });
});
