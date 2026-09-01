import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { emptyProject } from "../model/factory";
import { loopGap, wallLength } from "../model/geometry";
import { wallLengthForSide, wallMeasuredLength } from "../model/measure";
import { addPhoto, makePhoto } from "../model/photos";
import { loopNodeIds, loopWallIds, moveLoop } from "../model/loops";
import { addOpeningAtOffset, updateOpening } from "../model/ops";
import { sharedSpan, wallOpeningViews } from "../model/sharedOpenings";
import { wallLinePoints } from "../model/faces";
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

    const input = await screen.findByLabelText("Centreline");
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
    const input = await screen.findByLabelText("Centreline");
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

    const before = wallLength(useStore.getState().project, wallId);
    const input = await screen.findByLabelText("Inside face");
    await userEvent.clear(input);
    await userEvent.type(input, "410");
    fireEvent.blur(input);

    const p = useStore.getState().project;
    // The inside face is now exactly what was typed, and the wall itself has not moved.
    expect(wallMeasuredLength(p, wallId)).toBe(4100);
    expect(wallLength(p, wallId)).toBe(before);
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
    // Every line is offered by name, whichever the project measures from.
    expect(await screen.findByLabelText("Centreline")).toBeInTheDocument();
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

describe("a door in a wall two rooms come to share", () => {
  async function twoRoomsWithDoor() {
    render(<App />);
    for (const sizes of ["400,90,300,90,400,90,300,90", "250,90,300,90,250,90,300,90"]) {
      await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
      await userEvent.type(screen.getByTestId("measurements-input"), sizes);
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    act(() =>
      useStore.getState().apply((p) => {
        const b = p.walls.find((w) => w.label === "B")!;
        return addOpeningAtOffset(p, b.id, 1200, "door").project;
      }),
    );
    return useStore.getState().project.openings[0];
  }

  /** Slide the second room until its left edge is a whisker from the first's right. */
  function parkAlmostTouching(gap: number) {
    act(() =>
      useStore.getState().apply((p) => {
        const movingIds = new Set(loopNodeIds(p, p.walls.find((w) => w.label === "E")!.id));
        const movingLeft = Math.min(
          ...p.nodes.filter((n) => movingIds.has(n.id)).map((n) => n.x),
        );
        const stationaryRight = Math.max(
          ...p.nodes.filter((n) => !movingIds.has(n.id)).map((n) => n.x),
        );
        return moveLoop(
          p,
          p.walls.find((w) => w.label === "E")!.id,
          stationaryRight + gap - movingLeft,
          0,
        );
      }),
    );
  }

  function nudge() {
    const svg = screen.getByTestId("plan-svg");
    const wallE = screen
      .getAllByTestId("wall")
      .find((w) => w.getAttribute("data-wall-label") === "E")!;
    fireEvent.pointerDown(wallE, { clientX: 500, clientY: 200, button: 0 });
    fireEvent.pointerMove(svg, { clientX: 499, clientY: 200 });
    fireEvent.pointerUp(svg, { clientX: 499, clientY: 200 });
  }

  /** The wall of the arriving room that has come to rest on wall B. */
  function sharedWallId() {
    const p = useStore.getState().project;
    const b = p.walls.find((w) => w.label === "B")!.id;
    return loopWallIds(p, p.walls.find((w) => w.label === "E")!.id).find((id) =>
      sharedSpan(p, id, b),
    );
  }

  it("leaves the door exactly as it was, with no second door made", async () => {
    const original = await twoRoomsWithDoor();
    parkAlmostTouching(40);
    nudge();

    const p = useStore.getState().project;
    expect(p.openings).toHaveLength(1);
    expect(p.openings[0]).toEqual(original);
  });

  it("shows that one door on the arriving room's wall too", async () => {
    const original = await twoRoomsWithDoor();
    parkAlmostTouching(40);
    nudge();

    const p = useStore.getState().project;
    const views = wallOpeningViews(p, sharedWallId()!);
    expect(views).toHaveLength(1);
    expect(views[0].opening.id).toBe(original.id);
    expect(views[0].own).toBe(false);
  });

  it("lists it in the arriving wall's panel, marked as shared", async () => {
    await twoRoomsWithDoor();
    parkAlmostTouching(40);
    nudge();

    act(() => useStore.getState().select({ kind: "wall", id: sharedWallId()! }));
    const rows = await screen.findAllByTestId("opening-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-shared")).toBe("true");
    expect(rows[0]).toHaveTextContent(/shared with wall B/);
  });

  it("moving the door moves it for both rooms, because it is one door", async () => {
    const original = await twoRoomsWithDoor();
    parkAlmostTouching(40);
    nudge();

    const before = wallOpeningViews(useStore.getState().project, sharedWallId()!)[0].offset;
    act(() =>
      useStore.getState().apply((p) => updateOpening(p, original.id, { offset: 2000 })),
    );
    const after = wallOpeningViews(useStore.getState().project, sharedWallId()!)[0].offset;

    expect(after).not.toBe(before);
    expect(useStore.getState().project.openings).toHaveLength(1);
  });

  it("shows nothing on the other wall once the rooms are pulled apart", async () => {
    await twoRoomsWithDoor();
    parkAlmostTouching(40);
    nudge();
    const shared = sharedWallId()!;
    expect(wallOpeningViews(useStore.getState().project, shared)).toHaveLength(1);

    act(() =>
      useStore
        .getState()
        .apply((p) => moveLoop(p, p.walls.find((w) => w.label === "E")!.id, 6000, 0)),
    );
    expect(wallOpeningViews(useStore.getState().project, shared)).toEqual([]);
  });

  it("shows nothing extra when the rooms never touch", async () => {
    await twoRoomsWithDoor();
    parkAlmostTouching(9000);
    nudge();
    expect(useStore.getState().project.openings).toHaveLength(1);
  });
});

describe("drawing against an existing wall's faces", () => {
  async function aRoom() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(screen.getByTestId("measurements-input"), "400,90,300,90,400,90,300,90");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
  }

  it("draws the centreline inside each wall, so all three lines are visible", async () => {
    await aRoom();
    expect(screen.getAllByTestId("wall-centreline")).toHaveLength(4);
  });

  it("marks the cursor when it catches a wall's face", async () => {
    await aRoom();
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));

    const p = useStore.getState().project;
    const inner = wallLinePoints(p, p.walls[0].id, "left").from;

    // Start a run, then bring the cursor onto the inner face corner of an existing wall.
    const svg = screen.getByTestId("plan-svg");
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 500, button: 0 });

    // Convert the face corner to screen coordinates through the SVG's own transform.
    const el = svg as unknown as SVGSVGElement;
    const vb = el.getAttribute("viewBox")!.split(" ").map(Number);
    const rect = { width: 900, height: 600 };
    const px = ((inner.x - vb[0]) / vb[2]) * rect.width;
    const py = ((inner.y - vb[1]) / vb[3]) * rect.height;
    fireEvent.pointerMove(svg, { clientX: px, clientY: py });

    const marker = screen.queryByTestId("snap-marker");
    expect(marker).not.toBeNull();
    expect(marker!.getAttribute("data-kind")).toBe("face");
  });

  it("lands the drawn corner exactly on the face it caught", async () => {
    await aRoom();
    await userEvent.click(screen.getByRole("button", { name: "Wall" }));

    const p = useStore.getState().project;
    const inner = wallLinePoints(p, p.walls[0].id, "left").from;

    const svg = screen.getByTestId("plan-svg");
    const el = svg as unknown as SVGSVGElement;
    const vb = el.getAttribute("viewBox")!.split(" ").map(Number);
    const px = ((inner.x - vb[0]) / vb[2]) * 900;
    const py = ((inner.y - vb[1]) / vb[3]) * 600;

    fireEvent.pointerDown(svg, { clientX: 300, clientY: 500, button: 0 });
    fireEvent.pointerDown(svg, { clientX: px, clientY: py, button: 0 });
    fireEvent.keyDown(window, { key: "Enter" });

    const after = useStore.getState().project;
    expect(after.nodes.some((n) => n.x === inner.x && n.y === inner.y)).toBe(true);
  });
});

describe("editing a wall's two faces", () => {
  async function aRoomWithName() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(screen.getByTestId("room-name-input"), "Kitchen");
    await userEvent.type(screen.getByTestId("measurements-input"), "400,90,300,90,400,90,300,90");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));

    const p = useStore.getState().project;
    act(() => useStore.getState().select({ kind: "wall", id: p.walls[0].id }));
    return p.walls[0].id;
  }

  it("offers a field per face, named after what is on that side", async () => {
    await aRoomWithName();
    expect(await screen.findByTestId("wall-faces")).toBeInTheDocument();
    // A length for each of the wall's three lines...
    expect(screen.getByLabelText("Kitchen face")).toBeInTheDocument();
    expect(screen.getByLabelText("Centreline")).toBeInTheDocument();
    expect(screen.getByLabelText("Outside face")).toBeInTheDocument();
    // ...and a face offset for each side.
    expect(screen.getByLabelText("Kitchen side")).toBeInTheDocument();
    expect(screen.getByLabelText("Outside side")).toBeInTheDocument();
  });

  it("moves one face without touching the other", async () => {
    const wallId = await aRoomWithName();
    const before = useStore.getState().project.walls.find((w) => w.id === wallId)!.offsets;

    const field = await screen.findByLabelText("Kitchen side");
    await userEvent.clear(field);
    await userEvent.type(field, "25");
    fireEvent.blur(field);

    const after = useStore.getState().project.walls.find((w) => w.id === wallId)!.offsets;
    expect(after.left).toBe(250);
    expect(after.right).toBe(before.right);
  });

  it("shows the resulting thickness as the two faces together", async () => {
    const wallId = await aRoomWithName();
    const field = await screen.findByLabelText("Kitchen side");
    await userEvent.clear(field);
    await userEvent.type(field, "25");
    fireEvent.blur(field);

    act(() => useStore.getState().select({ kind: "wall", id: wallId }));
    expect(await screen.findByTestId("wall-faces")).toHaveTextContent("30 cm overall");
  });

  it("refuses to put a face behind the centreline", async () => {
    const wallId = await aRoomWithName();
    const field = await screen.findByLabelText("Kitchen side");
    await userEvent.clear(field);
    await userEvent.type(field, "-15");
    fireEvent.blur(field);

    expect(
      useStore.getState().project.walls.find((w) => w.id === wallId)!.offsets.left,
    ).toBe(0);
  });
});

describe("editing a wall's lengths", () => {
  async function selectedWall() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(screen.getByTestId("room-name-input"), "Study");
    await userEvent.type(screen.getByTestId("measurements-input"), "400,90,300,90,400,90,300,90");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    const id = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id }));
    return id;
  }

  it("offers a length for each of the wall's three lines", async () => {
    await selectedWall();
    expect(await screen.findByTestId("wall-lengths")).toBeInTheDocument();
    expect(screen.getByLabelText("Study face")).toBeInTheDocument();
    expect(screen.getByLabelText("Centreline")).toBeInTheDocument();
    expect(screen.getByLabelText("Outside face")).toBeInTheDocument();
  });

  it("takes a length typed against the inside face", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Study face");
    await userEvent.clear(field);
    await userEvent.type(field, "350");
    fireEvent.blur(field);

    const p = useStore.getState().project;
    expect(wallLengthForSide(p, id, 1)).toBe(3500);
  });

  it("takes a length typed against the outside face just the same", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Outside face");
    await userEvent.clear(field);
    await userEvent.type(field, "450");
    fireEvent.blur(field);

    expect(wallLengthForSide(useStore.getState().project, id, -1)).toBe(4500);
  });

  it("leaves the other two lines exactly as they were", async () => {
    const id = await selectedWall();
    const before = [1, 0, -1].map((s) => wallLengthForSide(useStore.getState().project, id, s));

    const field = await screen.findByLabelText("Study face");
    await userEvent.clear(field);
    await userEvent.type(field, "350");
    fireEvent.blur(field);

    const after = [1, 0, -1].map((s) => wallLengthForSide(useStore.getState().project, id, s));
    expect(after[0]).toBe(3500);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("offers to square the ends again once a face has been changed", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Study face");
    await userEvent.clear(field);
    await userEvent.type(field, "350");
    fireEvent.blur(field);

    act(() => useStore.getState().select({ kind: "wall", id }));
    await userEvent.click(await screen.findByRole("button", { name: "Square the ends again" }));
    expect(wallLengthForSide(useStore.getState().project, id, 1)).not.toBe(3500);
  });

  it("the centreline still moves the wall itself", async () => {
    const id = await selectedWall();
    const before = useStore.getState().project.nodes.map((n) => ({ ...n }));

    const field = await screen.findByLabelText("Centreline");
    await userEvent.clear(field);
    await userEvent.type(field, "350");
    fireEvent.blur(field);

    expect(useStore.getState().project.nodes).not.toEqual(before);
    expect(wallLengthForSide(useStore.getState().project, id, 0)).toBe(3500);
  });
});

describe("choosing which face each wall's elevation shows", () => {
  async function aRoom() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(screen.getByTestId("room-name-input"), "Study");
    await userEvent.type(screen.getByTestId("measurements-input"), "400,90,300,90,400,90,300,90");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  }

  it("lists every wall with a choice of face", async () => {
    await aRoom();
    expect(screen.getByRole("dialog", { name: "Export PDF" })).toBeInTheDocument();
    expect(screen.getAllByTestId("export-wall-row")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Wall A: Study" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wall A: Outside" })).toBeInTheDocument();
  });

  it("shows which face a wall will use before anything is chosen", async () => {
    await aRoom();
    // The project measures inside faces, so that is what is already selected.
    expect(screen.getByRole("button", { name: "Wall A: Study" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches one wall to its other face without touching the rest", async () => {
    await aRoom();
    await userEvent.click(screen.getByRole("button", { name: "Wall A: Outside" }));

    const walls = useStore.getState().project.walls;
    expect(walls[0].elevationFace).toBe("right");
    expect(walls[1].elevationFace).toBeUndefined();
  });

  it("gives a wall two pages when both faces are asked for", async () => {
    await aRoom();
    const before = pageTitles(useStore.getState().project).length;
    await userEvent.click(screen.getByRole("button", { name: "Wall A: Both" }));

    const titles = pageTitles(useStore.getState().project);
    expect(titles).toHaveLength(before + 1);
    // The two pages say which side each one shows.
    expect(titles.filter((t) => t.includes("Wall A"))).toEqual([
      "Wall A — Study (from the Study side)",
      "Wall A — Study (from the Outside side)",
    ]);
  });

  it("sets every wall at once", async () => {
    await aRoom();
    await userEvent.click(screen.getByRole("button", { name: "Both faces" }));
    expect(
      useStore.getState().project.walls.every((w) => w.elevationFace === "both"),
    ).toBe(true);
    // Four walls, two sides each, plus the plan and the sketch page.
    expect(pageTitles(useStore.getState().project)).toHaveLength(10);
  });

  it("says how many pages will come out", async () => {
    await aRoom();
    expect(screen.getByTestId("export-page-count")).toHaveTextContent("6 pages");
  });

  it("leaves the project alone when cancelled", async () => {
    await aRoom();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Export PDF" })).toBeNull();
  });
});

describe("measurements finer than a whole centimetre", () => {
  async function selectedWall() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Room from sizes…" }));
    await userEvent.type(screen.getByTestId("room-name-input"), "Study");
    await userEvent.type(screen.getByTestId("measurements-input"), "400,90,300,90,400,90,300,90");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    const id = useStore.getState().project.walls[0].id;
    act(() => useStore.getState().select({ kind: "wall", id }));
    return id;
  }

  it("keeps a half centimetre typed into a face offset", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Study side");
    await userEvent.clear(field);
    await userEvent.type(field, "9.5");
    fireEvent.blur(field);

    expect(useStore.getState().project.walls.find((w) => w.id === id)!.offsets.left).toBe(95);
  });

  it("reads a half centimetre back rather than rounding it on the way to the screen", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Study side");
    await userEvent.clear(field);
    await userEvent.type(field, "9.5");
    fireEvent.blur(field);

    act(() => useStore.getState().select({ kind: "wall", id }));
    expect(await screen.findByLabelText("Study side")).toHaveValue(9.5);
  });

  it("does not drift when the same value is committed twice", async () => {
    const id = await selectedWall();
    for (let i = 0; i < 3; i += 1) {
      act(() => useStore.getState().select({ kind: "wall", id }));
      const field = await screen.findByLabelText("Study side");
      fireEvent.blur(field);
    }
    // Re-committing what the field already showed must not move the wall.
    expect(useStore.getState().project.walls.find((w) => w.id === id)!.offsets.left).toBe(50);
  });

  it("keeps a millimetre typed into a length", async () => {
    const id = await selectedWall();
    const field = await screen.findByLabelText("Centreline");
    await userEvent.clear(field);
    await userEvent.type(field, "412.3");
    fireEvent.blur(field);

    expect(wallLength(useStore.getState().project, id)).toBe(4123);
  });

  it("keeps a millimetre when the project is in metres", async () => {
    const id = await selectedWall();
    await userEvent.selectOptions(screen.getByLabelText("Units"), "m");
    act(() => useStore.getState().select({ kind: "wall", id }));

    const field = await screen.findByLabelText("Centreline");
    await userEvent.clear(field);
    await userEvent.type(field, "4.123");
    fireEvent.blur(field);

    expect(wallLength(useStore.getState().project, id)).toBe(4123);
  });
});
