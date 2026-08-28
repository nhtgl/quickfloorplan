import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { emptyProject } from "../model/factory";
import { loopGap, wallLength } from "../model/geometry";
import { wallMeasuredLength } from "../model/measure";
import { addPhoto, makePhoto } from "../model/photos";
import { loopNodeIds, moveLoop } from "../model/loops";
import { pageTitles } from "../export/pageTitles";
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

describe("taking back a corner", () => {
  const draftPoints = () => screen.queryAllByTestId("draft-point").length;

  it("backspace removes the last corner placed", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    expect(draftPoints()).toBe(3);

    fireEvent.keyDown(window, { key: "Backspace" });
    expect(draftPoints()).toBe(2);

    fireEvent.keyDown(window, { key: "Backspace" });
    expect(draftPoints()).toBe(1);
  });

  it("lets a misplaced corner be replaced without starting over", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 500); // too far down
    fireEvent.keyDown(window, { key: "Backspace" });
    clickPlan(600, 400);
    clickPlan(200, 400);
    clickPlan(200, 150);

    const p = useStore.getState().project;
    expect(p.walls).toHaveLength(4);
    expect(loopGap(p, p.walls[0].id)).toBe(0);
  });

  it("does nothing when no corner has been placed", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(draftPoints()).toBe(0);
    expect(useStore.getState().project.walls).toHaveLength(0);
  });

  it("leaves a corner alone when backspace is pressed inside a field", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    expect(draftPoints()).toBe(2);

    const nameField = screen.getByLabelText("Project name");
    fireEvent.keyDown(nameField, { key: "Backspace" });
    expect(draftPoints()).toBe(2);
  });

  it("does not fit the view when 'f' is typed into a field", async () => {
    render(<App />);
    const nameField = screen.getByLabelText("Project name");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Flat f");
    expect((nameField as HTMLInputElement).value).toBe("Flat f");
  });
});

describe("alignment guides", () => {
  /** Move the pointer over the canvas without clicking. */
  function movePlan(x: number, y: number) {
    fireEvent.pointerMove(screen.getByTestId("plan-svg"), { clientX: x, clientY: y });
  }

  it("shows a guide when the new corner lines up with an existing one", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    // Start a new run well away, then drift back onto the first wall's far corner column.
    clickPlan(300, 500);
    movePlan(601, 620);

    const guides = screen.getAllByTestId("align-guide");
    expect(guides.length).toBeGreaterThan(0);
    expect(guides.some((g) => g.getAttribute("data-axis") === "x")).toBe(true);
  });

  it("shows no guide when nothing lines up", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    movePlan(437, 386);
    expect(screen.queryAllByTestId("align-guide")).toHaveLength(0);
  });

  it("places the corner on the alignment it showed", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    const cornerX = useStore.getState().project.nodes[1].x;

    clickPlan(300, 500);
    movePlan(601, 620);
    clickPlan(601, 620);
    fireEvent.keyDown(window, { key: "Enter" });

    const nodes = useStore.getState().project.nodes;
    // The placed corner took the aligned corner's exact x, not the raw cursor position.
    expect(nodes[nodes.length - 1].x).toBe(cornerX);
  });

  it("holding Alt suppresses the guides", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    fireEvent.keyDown(window, { key: "Enter" });

    clickPlan(300, 500);
    fireEvent.keyDown(window, { key: "Alt" });
    movePlan(601, 620);
    expect(screen.queryAllByTestId("align-guide")).toHaveLength(0);
  });
});

describe("dragging a corner", () => {
  async function drawSquare() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 400);
    clickPlan(200, 150);
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
  }

  const handles = () => screen.getAllByTestId("node-handle");
  const nodeAt = (i: number) => useStore.getState().project.nodes[i];

  it("lets go of the corner on pointer up", async () => {
    await drawSquare();
    const svg = screen.getByTestId("plan-svg");

    fireEvent.pointerDown(handles()[0], { clientX: 200, clientY: 150, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 150 });
    const dropped = { ...nodeAt(0) };
    fireEvent.pointerUp(svg, { clientX: 260, clientY: 150 });

    // Moving the pointer after letting go must not carry the corner along.
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 500 });
    expect(nodeAt(0).x).toBe(dropped.x);
    expect(nodeAt(0).y).toBe(dropped.y);
  });

  it("moves the corner while the pointer is down", async () => {
    await drawSquare();
    const svg = screen.getByTestId("plan-svg");
    const before = { ...nodeAt(0) };

    fireEvent.pointerDown(handles()[0], { clientX: 200, clientY: 150, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 280, clientY: 210 });
    fireEvent.pointerUp(svg, { clientX: 280, clientY: 210 });

    expect(nodeAt(0).x).not.toBe(before.x);
  });

  it("records the whole drag as a single undo step", async () => {
    await drawSquare();
    const svg = screen.getByTestId("plan-svg");
    const before = { ...nodeAt(0) };

    fireEvent.pointerDown(handles()[0], { clientX: 200, clientY: 150, button: 0 });
    for (let x = 210; x <= 300; x += 10) {
      fireEvent.pointerMove(svg, { clientX: x, clientY: 150 });
    }
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 150 });

    act(() => useStore.getState().undo());
    expect(nodeAt(0).x).toBe(before.x);
  });
});

describe("room from typed measurements", () => {
  async function openDialog() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    return screen.getByRole("dialog", { name: "Create a room from measurements" });
  }

  it("builds a closed room from alternating lengths and turns", async () => {
    await openDialog();
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,250,90,100,90",
    );
    expect(screen.getByTestId("measurement-readout")).toHaveTextContent("Closes exactly");

    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const p = useStore.getState().project;
    expect(p.walls).toHaveLength(4);
    expect(p.rooms).toHaveLength(1);
    expect(loopGap(p, p.walls[0].id)).toBe(0);
  });

  it("makes the inside faces match what was typed", async () => {
    await openDialog();
    await userEvent.selectOptions(screen.getByLabelText("Measure walls from"), "inside");
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,250,90,100,90",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const p = useStore.getState().project;
    expect(p.walls.map((w) => wallMeasuredLength(p, w.id))).toEqual([2500, 1000, 2500, 1000]);
  });

  it("reads lengths only when told every corner is square", async () => {
    await openDialog();
    await userEvent.click(screen.getByLabelText("Every corner is square"));
    await userEvent.type(screen.getByLabelText("Measurements"), "250,100,250,100");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useStore.getState().project.walls).toHaveLength(4);
  });

  it("names the room and selects it so it can be edited straight away", async () => {
    await openDialog();
    await userEvent.type(screen.getByTestId("room-name-input"), "Kitchen");
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,250,90,100,90",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const p = useStore.getState().project;
    expect(p.rooms[0].name).toBe("Kitchen");
    expect(useStore.getState().selection).toEqual({ kind: "room", id: p.rooms[0].id });
  });

  it("says so when the numbers do not close, and adds walls without a room", async () => {
    await openDialog();
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,900,90,100,90",
    );
    expect(screen.getByTestId("measurement-readout")).toHaveTextContent("Misses its own start");

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    const p = useStore.getState().project;
    expect(p.walls).toHaveLength(4);
    expect(p.rooms).toHaveLength(0);
  });

  it("explains a bad entry instead of drawing nothing", async () => {
    await openDialog();
    await userEvent.type(screen.getByLabelText("Measurements"), "250,90,wide");
    expect(screen.getByTestId("measurement-error")).toHaveTextContent("wide");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("leaves the project alone when cancelled", async () => {
    await openDialog();
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,250,90,100,90",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useStore.getState().project.walls).toHaveLength(0);
  });

  it("is a single undo step", async () => {
    await openDialog();
    await userEvent.type(
      screen.getByLabelText("Measurements"),
      "250,90,100,90,250,90,100,90",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    act(() => useStore.getState().undo());
    expect(useStore.getState().project.walls).toHaveLength(0);
  });
});

describe("bringing new work into view", () => {
  it("asks the canvas to refit after building a room off to the side", async () => {
    render(<App />);
    const before = useStore.getState().fitSignal;
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(
      screen.getByTestId("measurements-input"),
      "250,90,100,90,250,90,100,90",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(useStore.getState().fitSignal).toBeGreaterThan(before);
  });
});

describe("reference photos", () => {
  const seed = (caption = "") =>
    act(() =>
      useStore.getState().apply((p) =>
        addPhoto(
          p,
          makePhoto({
            name: "kitchen.jpg",
            caption,
            dataUrl: "data:image/jpeg;base64,AAAA",
            width: 1400,
            height: 1050,
          }),
        ),
      ),
    );

  async function openPhotos() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Photos…" }));
  }

  it("says when there are none", async () => {
    await openPhotos();
    expect(screen.getByText("None yet.")).toBeInTheDocument();
  });

  it("lists a photo with its file name and a caption field", async () => {
    seed();
    await openPhotos();
    const rows = screen.getAllByTestId("photo-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("kitchen.jpg");
    expect(screen.getByLabelText("Caption for kitchen.jpg")).toBeInTheDocument();
  });

  it("captions a photo, which titles its page in the PDF", async () => {
    seed();
    await openPhotos();
    await userEvent.type(
      screen.getByLabelText("Caption for kitchen.jpg"),
      "Looking north",
    );
    const p = useStore.getState().project;
    expect(p.photos![0].caption).toBe("Looking north");
    expect(pageTitles(p)).toContain("Looking north");
  });

  it("removes a photo", async () => {
    seed();
    await openPhotos();
    await userEvent.click(screen.getByRole("button", { name: "Remove kitchen.jpg" }));
    expect(useStore.getState().project.photos).toEqual([]);
  });

  it("warns when the photos make the file too big to email comfortably", async () => {
    act(() =>
      useStore.getState().apply((p) =>
        addPhoto(
          p,
          makePhoto({
            name: "huge.jpg",
            caption: "",
            dataUrl: `data:image/jpeg;base64,${"A".repeat(5_000_000)}`,
            width: 1400,
            height: 1050,
          }),
        ),
      ),
    );
    await openPhotos();
    expect(screen.getByTestId("photo-budget-warning")).toBeInTheDocument();
  });
});

describe("the sketch page", () => {
  it("sits right after the plan, so the two can be compared", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    clickPlan(200, 150);
    clickPlan(600, 150);
    clickPlan(600, 400);
    clickPlan(200, 150);

    expect(pageTitles(useStore.getState().project).slice(0, 2)).toEqual([
      "Floor Plan",
      "Sketch Plan",
    ]);
  });
});

describe("moving a whole room", () => {
  /** Two rooms built from typed sizes, the second placed clear of the first. */
  async function twoRooms() {
    render(<App />);
    for (const sizes of ["400,90,300,90,400,90,300,90", "250,90,200,90,250,90,200,90"]) {
      await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
      await userEvent.type(screen.getByTestId("measurements-input"), sizes);
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
  }

  const wallEl = (label: string) =>
    screen.getAllByTestId("wall").find((w) => w.getAttribute("data-wall-label") === label)!;

  const loopXs = (label: string) => {
    const p = useStore.getState().project;
    const id = p.walls.find((w) => w.label === label)!.id;
    const ids = new Set(loopNodeIds(p, id));
    return p.nodes.filter((n) => ids.has(n.id)).map((n) => n.x);
  };

  it("drags every wall of a room together", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");
    const before = loopXs("E");

    fireEvent.pointerDown(wallEl("E"), { clientX: 400, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 360, clientY: 230 });
    fireEvent.pointerUp(svg, { clientX: 360, clientY: 230 });

    const after = loopXs("E");
    // Every corner shifted by the same amount, so the room kept its shape.
    const shifts = new Set(after.map((x, i) => x - before[i]));
    expect(shifts.size).toBe(1);
    expect([...shifts][0]).not.toBe(0);
  });

  it("leaves the other room where it was", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");
    const before = loopXs("A");

    fireEvent.pointerDown(wallEl("E"), { clientX: 400, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 340, clientY: 260 });
    fireEvent.pointerUp(svg, { clientX: 340, clientY: 260 });

    expect(loopXs("A")).toEqual(before);
  });

  it("takes the room's tint along with its walls", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");
    const before = useStore.getState().project.rooms[1].polygon[0].x;

    fireEvent.pointerDown(wallEl("E"), { clientX: 400, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 350, clientY: 200 });
    fireEvent.pointerUp(svg, { clientX: 350, clientY: 200 });

    expect(useStore.getState().project.rooms[1].polygon[0].x).not.toBe(before);
  });

  it("snaps the moved room exactly onto the other one", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");

    const edgeOf = (label: string, pick: (xs: number[]) => number) => pick(loopXs(label));
    const targetX = edgeOf("A", (xs) => Math.max(...xs));

    // Park the room a few centimetres short of touching, then nudge it. Only snapping
    // can close a gap that small, so an exact landing proves it happened.
    const gap = 40;
    act(() =>
      useStore
        .getState()
        .apply((p) =>
          moveLoop(
            p,
            p.walls.find((w) => w.label === "E")!.id,
            targetX + gap - edgeOf("E", (xs) => Math.min(...xs)),
            0,
          ),
        ),
    );
    expect(edgeOf("E", (xs) => Math.min(...xs))).toBe(targetX + gap);

    fireEvent.pointerDown(wallEl("E"), { clientX: 500, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 499, clientY: 200 });
    const guides = screen.getAllByTestId("align-guide");
    fireEvent.pointerUp(svg, { clientX: 499, clientY: 200 });

    // Left edge of the moved room now sits exactly on the right edge of the other.
    expect(edgeOf("E", (xs) => Math.min(...xs))).toBe(targetX);
    expect(guides.some((g) => g.getAttribute("data-axis") === "x")).toBe(true);
  });

  it("drops the guides once the drag ends", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");
    fireEvent.pointerDown(wallEl("E"), { clientX: 500, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 499, clientY: 200 });
    fireEvent.pointerUp(svg, { clientX: 499, clientY: 200 });
    expect(screen.queryAllByTestId("align-guide")).toHaveLength(0);
  });

  it("is a single undo step", async () => {
    await twoRooms();
    const svg = screen.getByTestId("plan-svg");
    const before = loopXs("E");

    fireEvent.pointerDown(wallEl("E"), { clientX: 400, clientY: 200, button: 0 });
    for (let x = 395; x >= 350; x -= 5) {
      fireEvent.pointerMove(svg, { clientX: x, clientY: 200 });
    }
    fireEvent.pointerUp(svg, { clientX: 350, clientY: 200 });
    expect(loopXs("E")).not.toEqual(before);

    act(() => useStore.getState().undo());
    expect(loopXs("E")).toEqual(before);
  });

  it("does not move a room while the wall tool is active", async () => {
    await twoRooms();
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));
    const svg = screen.getByTestId("plan-svg");
    const before = loopXs("E");

    fireEvent.pointerDown(wallEl("E"), { clientX: 400, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 340, clientY: 240 });
    fireEvent.pointerUp(svg, { clientX: 340, clientY: 240 });

    expect(loopXs("E")).toEqual(before);
  });
});

describe("dragging a room in many small steps", () => {
  it("lands where a single big step would, not short of it", async () => {
    render(<App />);
    for (const sizes of ["400,90,300,90,400,90,300,90", "250,90,200,90,250,90,200,90"]) {
      await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
      await userEvent.type(screen.getByTestId("measurements-input"), sizes);
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    const svg = screen.getByTestId("plan-svg");
    const wallE = screen
      .getAllByTestId("wall")
      .find((w) => w.getAttribute("data-wall-label") === "E")!;
    const xs = (label: string) => {
      const p = useStore.getState().project;
      const id = p.walls.find((w) => w.label === label)!.id;
      const ids = new Set(loopNodeIds(p, id));
      return p.nodes.filter((n) => ids.has(n.id)).map((n) => n.x);
    };

    const before = Math.min(...xs("E"));

    // Nudging across in many small moves must accumulate exactly like one big move.
    fireEvent.pointerDown(wallE, { clientX: 500, clientY: 200, button: 0 });
    for (let x = 495; x >= 460; x -= 5) {
      fireEvent.pointerMove(svg, { clientX: x, clientY: 200 });
    }
    fireEvent.pointerUp(svg, { clientX: 460, clientY: 200 });
    const stepwise = before - Math.min(...xs("E"));

    act(() => useStore.getState().undo());

    fireEvent.pointerDown(wallE, { clientX: 500, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 460, clientY: 200 });
    fireEvent.pointerUp(svg, { clientX: 460, clientY: 200 });
    const oneGo = before - Math.min(...xs("E"));

    expect(stepwise).toBe(oneGo);
  });
});
