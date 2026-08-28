import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { emptyProject } from "../model/factory";
import { loopGap, wallLength } from "../model/geometry";
import { wallMeasuredLength } from "../model/measure";
import { roomArea } from "../model/rooms";
import { useStore } from "../state/store";

/** Click at a plan position, going through the SVG's own coordinate mapping. */
function clickPlan(x: number, y: number) {
  const svg = screen.getByTestId("plan-svg");
  fireEvent.pointerDown(svg, { clientX: x, clientY: y, button: 0 });
}

beforeEach(() => {
  localStorage.clear();
  // Most flows assert raw geometry, so measure on centrelines unless a test says otherwise.
  act(() => useStore.getState().reset({ ...emptyProject("Test flat"), measureFrom: "centre" }));
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
    await userEvent.type(input, "420");
    fireEvent.blur(input);

    // Default unit is centimetres, so 420 typed means 4.20 m.
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

describe("wall panel", () => {
  it("lists every opening on the selected wall, in order along it", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(700, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    // Added out of order; the list must read along the wall.
    await userEvent.click(await screen.findByRole("button", { name: "+ Window" }));
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    await userEvent.click(await screen.findByRole("button", { name: "+ Door" }));
    act(() =>
      useStore.getState().apply((p) => ({
        ...p,
        openings: p.openings.map((o, i) => (i === 1 ? { ...o, offset: 600 } : o)),
      })),
    );
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    const rows = await screen.findAllByTestId("opening-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Door");
    expect(rows[1]).toHaveTextContent("Window");
  });

  it("selects an opening from the list", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(700, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    await userEvent.click(await screen.findByRole("button", { name: "+ Door" }));
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    await userEvent.click((await screen.findAllByTestId("opening-row"))[0]);
    expect(useStore.getState().selection.kind).toBe("opening");
  });

  it("removes an opening from the list", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(700, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    await userEvent.click(await screen.findByRole("button", { name: "+ Window" }));
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    await userEvent.click(await screen.findByRole("button", { name: /Delete window/i }));
    expect(useStore.getState().project.openings).toHaveLength(0);
  });
});

describe("units", () => {
  it("defaults to centimetres and switches the whole drawing to metres", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(useStore.getState().project.units).toBe("cm");

    await userEvent.selectOptions(screen.getByLabelText("Units"), "m");
    expect(useStore.getState().project.units).toBe("m");

    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    // The length field now reads and writes metres.
    const input = await screen.findByLabelText(/Length/);
    await userEvent.clear(input);
    await userEvent.type(input, "3.15");
    fireEvent.blur(input);
    expect(wallLength(useStore.getState().project, wallId)).toBe(3150);
  });
});

describe("measuring from inside or outside", () => {
  it("shows the inside face length and accepts a typed inside measurement", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 400);
    clickPlan(200, 150);

    await userEvent.selectOptions(screen.getByLabelText("Measure walls from"), "inside");
    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));

    const input = await screen.findByLabelText(/Length \(inside\)/);
    await userEvent.clear(input);
    await userEvent.type(input, "410");
    fireEvent.blur(input);

    const p = useStore.getState().project;
    // Typing the inside measurement leaves a centreline 100mm longer, one wall thickness.
    expect(wallLength(p, wallId)).toBe(4200);
    expect(wallMeasuredLength(p, wallId)).toBe(4100);
  });

  it("relabels the field when measuring from outside", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 150);

    await userEvent.selectOptions(screen.getByLabelText("Measure walls from"), "outside");
    const wallId = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    expect(await screen.findByLabelText(/Length \(outside\)/)).toBeInTheDocument();
  });
});

describe("view controls", () => {
  it("offers zoom and fit buttons", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit plan to view" })).toBeInTheDocument();
  });

  it("has a pan tool that does not draw", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Pan" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    expect(useStore.getState().project.walls).toHaveLength(0);
  });
});
