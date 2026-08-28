import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { chainOfWalls, emptyProject } from "../model/factory";
import { loopCentroid, wallEnds } from "../model/geometry";
import { newId } from "../model/ids";
import { ElevationSvg } from "./ElevationSvg";
import { PlanSvg } from "./PlanSvg";
import type { Point, Project } from "../model/types";

const RECT: Point[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];

/** Measured on centrelines so the expected numbers are the raw geometry. */
const base = (): Project => ({
  ...chainOfWalls(emptyProject("Flat"), RECT, true),
  measureFrom: "centre",
});

describe("PlanSvg", () => {
  it("draws one line per wall, labelled", () => {
    const { container } = render(<PlanSvg project={base()} width={800} height={600} />);
    const walls = container.querySelectorAll('[data-testid="wall"]');
    expect(walls).toHaveLength(4);
    expect([...walls].map((w) => w.getAttribute("data-wall-label"))).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("dimensions every wall in the project's unit", () => {
    const { container } = render(<PlanSvg project={base()} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("420 cm");
    expect(labels).toContain("310 cm");
  });

  it("switches to metres when the project says so", () => {
    const p = { ...base(), units: "m" as const };
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("4.20 m");
  });

  it("states inside-face lengths when the project measures from inside", () => {
    const p: Project = { ...base(), measureFrom: "inside" };
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    // 100 thick walls take 50 off each end of the 4200 and 3100 centrelines.
    expect(labels).toContain("410 cm");
    expect(labels).toContain("300 cm");
  });

  it("states outside-face lengths when the project measures from outside", () => {
    const p: Project = { ...base(), measureFrom: "outside" };
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("430 cm");
    expect(labels).toContain("320 cm");
  });

  it("draws a setting-out chain beside the overall length once a wall has an opening", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 1500,
        width: 1200,
        height: 1400,
        sill: 900,
      },
    ];
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    // Corner to opening, the opening, opening to far corner, and the overall.
    expect(labels).toContain("90 cm");
    expect(labels).toContain("120 cm");
    expect(labels).toContain("210 cm");
    expect(labels).toContain("420 cm");
  });

  it("leaves a wall with no openings a single overall dimension", () => {
    const { container } = render(<PlanSvg project={base()} width={800} height={600} />);
    expect(container.querySelectorAll('[data-kind="opening"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-kind="solid"]')).toHaveLength(0);
  });

  it("fills a room and states its name and area", () => {
    const p = base();
    p.rooms = [{ id: newId("r"), name: "Dining", tint: "#eef3ff", polygon: RECT }];
    const { container, getByText } = render(<PlanSvg project={p} width={800} height={600} />);
    const fill = container.querySelector('[data-testid="room-fill"]')!;
    expect(fill.getAttribute("fill")).toBe("#eef3ff");
    expect(getByText("Dining")).toBeInTheDocument();
    expect(getByText("13.0 m²")).toBeInTheDocument();
  });

  it("dashes a room edge that has no wall behind it", () => {
    const p = base();
    // Left half of the rectangle: its right-hand edge is a notional boundary.
    p.rooms = [
      {
        id: newId("r"),
        name: "Hall",
        tint: "#eef3ff",
        polygon: [
          { x: 0, y: 0 },
          { x: 1500, y: 0 },
          { x: 1500, y: 3100 },
          { x: 0, y: 3100 },
        ],
      },
    ];
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    const dashed = container.querySelectorAll('[data-testid="notional-edge"]');
    // Exactly one edge of the four is unbacked by a wall.
    expect(dashed).toHaveLength(1);
    expect(dashed[0].getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("draws a swing arc for a door but not for a window", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "door",
        offset: 1500,
        width: 900,
        height: 2050,
        sill: 0,
        hinge: "a",
        swing: "in",
      },
      {
        id: newId("o"),
        wallId: p.walls[1].id,
        kind: "window",
        offset: 1500,
        width: 1200,
        height: 1400,
        sill: 900,
      },
    ];
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    expect(container.querySelectorAll('[data-testid="door-arc"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="window-symbol"]')).toHaveLength(1);
  });

  it("shows the gap when a numeric edit has opened a loop", async () => {
    const { setWallLength } = await import("../model/geometry");
    const start = base();
    const p = setWallLength(start, start.walls[0].id, 5000);
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    expect(container.querySelectorAll('[data-testid="loop-gap"]').length).toBeGreaterThan(0);
  });
});

describe("ElevationSvg", () => {
  it("draws the wall face and each opening on it", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 1500,
        width: 1200,
        height: 1400,
        sill: 900,
      },
    ];
    const { container } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    expect(container.querySelector('[data-testid="wall-face"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="elevation-opening"]')).toHaveLength(1);
  });

  it("dimensions the wall length, its height and the opening sill", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 1500,
        width: 1200,
        height: 1400,
        sill: 900,
      },
    ];
    const { container } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("420 cm");
    expect(labels).toContain("260 cm");
    expect(labels).toContain("sill 90 cm");
    // The chain carries the opening width and the solid runs either side of it.
    expect(labels).toContain("120 cm");
    expect(labels).toContain("90 cm");
    expect(labels).toContain("210 cm");
  });

  it("omits the sill dimension for a door sitting on the floor", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "door",
        offset: 1500,
        width: 900,
        height: 2050,
        sill: 0,
        hinge: "a",
        swing: "in",
      },
    ];
    const { container } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels.some((l) => l?.startsWith("sill"))).toBe(false);
  });
});

describe("dimension placement with more than one room", () => {
  it("pushes each wall's dimension away from its own loop, not the whole plan", () => {
    // Two separate rectangles side by side. The point between them is on the wrong side
    // of half the walls, so a whole-plan centroid would draw dimensions inside a room.
    let p = chainOfWalls(emptyProject("Two"), RECT, true);
    p = chainOfWalls(
      p,
      [
        { x: 20_000, y: 0 },
        { x: 24_000, y: 0 },
        { x: 24_000, y: 3000 },
        { x: 20_000, y: 3000 },
      ],
      true,
    );
    p = { ...p, measureFrom: "centre" };

    const { container } = render(<PlanSvg project={p} width={900} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim"]')];

    // For every wall, the dimension line must sit outside the loop it belongs to.
    for (const wall of p.walls) {
      const centre = loopCentroid(p, wall.id)!;
      const { a, b } = wallEnds(p, wall.id);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Distance from the loop centre to the wall, versus to its dimension line.
      const toWall = Math.hypot(mid.x - centre.x, mid.y - centre.y);
      // The label nearest this wall's midpoint is its own.
      const line = labels
        .map((g) => g.querySelector("text")!)
        .map((t) => ({ x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")) }))
        .sort(
          (u, v) =>
            Math.hypot(u.x - mid.x, u.y - mid.y) - Math.hypot(v.x - mid.x, v.y - mid.y),
        )[0];
      expect(Math.hypot(line.x - centre.x, line.y - centre.y)).toBeGreaterThan(toWall);
    }
  });
});
