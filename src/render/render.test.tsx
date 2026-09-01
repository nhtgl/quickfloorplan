import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { chainOfWalls, emptyProject } from "../model/factory";
import { loopCentroid } from "../model/geometry";
import { facePointAt } from "../model/faces";
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

  const dimLabels = (p: Project) => {
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    return [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
  };

  it("dimensions both faces of every wall, each along itself", () => {
    const labels = dimLabels(base());
    // 100 thick walls take 50 off each end of the inner faces and add 50 to the outer.
    expect(labels).toContain("410 cm");
    expect(labels).toContain("430 cm");
    expect(labels).toContain("300 cm");
    expect(labels).toContain("320 cm");
  });

  it("never puts the centreline on the drawing, since nobody can measure it", () => {
    const labels = dimLabels(base());
    expect(labels).not.toContain("420 cm");
    expect(labels).not.toContain("310 cm");
  });

  it("draws a dimension per face whatever the project measures from", () => {
    for (const measureFrom of ["inside", "centre", "outside"] as const) {
      const labels = dimLabels({ ...base(), measureFrom });
      expect(labels).toContain("410 cm");
      expect(labels).toContain("430 cm");
    }
  });

  it("switches to metres when the project says so", () => {
    const labels = dimLabels({ ...base(), units: "m" });
    expect(labels).toContain("4.10 m");
    expect(labels).toContain("4.30 m");
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
    // Corner to opening, the opening, opening to far corner, and the overall — for the
    // inner face, and again for the outer.
    expect(labels).toContain("85 cm");
    expect(labels).toContain("120 cm");
    expect(labels).toContain("205 cm");
    expect(labels).toContain("410 cm");
    expect(labels).toContain("95 cm");
    expect(labels).toContain("215 cm");
    expect(labels).toContain("430 cm");
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
    // An elevation always shows one of the wall's faces: nobody can stand on a
    // centreline, so even a project measuring centrelines draws a face here.
    expect(labels).toContain("410 cm");
    expect(labels).toContain("260 cm");
    expect(labels).toContain("sill 90 cm");
    // The chain carries the opening width and the solid runs either side of it.
    expect(labels).toContain("120 cm");
    expect(labels).toContain("85 cm");
    expect(labels).toContain("205 cm");
  });

  it("mirrors the drawing when it shows the far face", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 900,
        width: 600,
        height: 1400,
        sill: 900,
      },
    ];
    const near = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} side={1} width={800} height={500} />,
    );
    const far = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} side={-1} width={800} height={500} />,
    );

    const openingX = (c: HTMLElement) =>
      Number(
        c
          .querySelector('[data-testid="elevation-opening"] rect')!
          .getAttribute("x"),
      );

    // The window sits 90cm from one end of a 420cm wall. Seen from the far side it is
    // near the other end instead, because the wall's two ends have swapped places.
    const nearX = openingX(near.container);
    const farX = openingX(far.container);
    expect(nearX).toBeLessThan(1000);
    expect(farX).toBeGreaterThan(3000);
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
  it("draws each face's dimension outside that face, in either room", () => {
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

    const { container } = render(<PlanSvg project={p} width={900} height={600} />);

    for (const wall of p.walls) {
      const centre = loopCentroid(p, wall.id)!;
      const inner = facePointAt(p, wall.id, 1, 100);
      const outer = facePointAt(p, wall.id, -1, 100);
      // The inner face is the one nearer the middle of its own room, in both rooms.
      expect(Math.hypot(inner.x - centre.x, inner.y - centre.y)).toBeLessThan(
        Math.hypot(outer.x - centre.x, outer.y - centre.y),
      );
    }

    // Both faces of every wall: neither room here has anything back to back with it.
    expect(container.querySelectorAll('[data-testid="face-dimensions"]')).toHaveLength(16);
  });
});

describe("a mirrored elevation", () => {
  it("keeps its dimension chain below the floor, not up the wall", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 900,
        width: 600,
        height: 1400,
        sill: 900,
      },
    ];

    const chainY = (side: number) => {
      const { container } = render(
        <ElevationSvg project={p} wallId={p.walls[0].id} side={side} width={800} height={500} />,
      );
      const wallBottom = Number(
        container.querySelector('[data-testid="wall-face"]')!.getAttribute("y"),
      ) + Number(container.querySelector('[data-testid="wall-face"]')!.getAttribute("height"));
      // The chain segments are the dimension groups tagged as solid or opening.
      const label = container.querySelector('[data-kind="opening"] text')!;
      return { labelY: Number(label.getAttribute("y")), wallBottom };
    };

    for (const side of [1, -1]) {
      const { labelY, wallBottom } = chainY(side);
      // Below the foot of the wall in both directions.
      expect(labelY).toBeGreaterThan(wallBottom);
    }
  });
});

describe("ventilation openings on the drawings", () => {
  const withVent = () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "vent",
        offset: 2000,
        width: 150,
        height: 150,
        sill: 2200,
      },
    ];
    return p;
  };

  it("marks the wall on the plan rather than cutting through it", () => {
    const { container } = render(<PlanSvg project={withVent()} width={800} height={600} />);
    expect(container.querySelector('[data-testid="vent-mark"]')).toBeInTheDocument();
  });

  it("still cuts the wall for a window, so the two read differently", () => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind: "window",
        offset: 2000,
        width: 1200,
        height: 1400,
        sill: 900,
      },
    ];
    const { container } = render(<PlanSvg project={p} width={800} height={600} />);
    expect(container.querySelector('[data-testid="vent-mark"]')).toBeNull();
    expect(container.querySelector('[data-testid="window-symbol"]')).toBeInTheDocument();
  });

  it("draws it hatched and named on the elevation", () => {
    const p = withVent();
    const { container, getByText } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    expect(container.querySelector('[data-testid="vent-hatch"]')).toBeInTheDocument();
    expect(getByText("Vent")).toBeInTheDocument();
  });

  it("dimensions its height above the floor, which is the point of a vent", () => {
    const p = withVent();
    const { container } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    const labels = [...container.querySelectorAll('[data-testid="dim-label"]')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("sill 220 cm");
    expect(labels).toContain("15 cm");
  });
});

describe("labelling an opening too small to write in", () => {
  const openingOf = (kind: "vent" | "window", width: number, height: number) => {
    const p = base();
    p.openings = [
      {
        id: newId("o"),
        wallId: p.walls[0].id,
        kind,
        offset: 2000,
        width,
        height,
        sill: kind === "vent" ? 2200 : 900,
      },
    ];
    return p;
  };

  const placement = (p: Project) => {
    const { container } = render(
      <ElevationSvg project={p} wallId={p.walls[0].id} width={800} height={500} />,
    );
    return container
      .querySelector('[data-testid="opening-label"]')!
      .getAttribute("data-placement");
  };

  it("writes the name inside an opening wide enough to hold it", () => {
    expect(placement(openingOf("window", 1200, 1400))).toBe("inside");
  });

  it("writes it above a vent, which is too narrow for its own name", () => {
    expect(placement(openingOf("vent", 150, 150))).toBe("above");
  });
});
