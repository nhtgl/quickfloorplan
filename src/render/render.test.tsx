import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { chainOfWalls, emptyProject } from "../model/factory";
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

const base = (): Project => chainOfWalls(emptyProject("Flat"), RECT, true);

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

  it("dimensions every wall in metres", () => {
    const { container } = render(<PlanSvg project={base()} width={800} height={600} />);
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("4.20 m");
    expect(labels).toContain("3.10 m");
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
    expect(labels).toContain("4.20 m");
    expect(labels).toContain("2.60 m");
    expect(labels).toContain("sill 0.90 m");
    expect(labels).toContain("1.20 m");
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
