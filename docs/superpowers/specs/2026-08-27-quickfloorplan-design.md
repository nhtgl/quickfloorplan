# QuickFloorPlan — Design

**Date:** 2026-08-27
**Status:** Approved

## Purpose

A drawing tool for people who are not designers. You draw the walls of a flat, type in the
measurements, mark where the doors and windows are, outline the rooms, and export a PDF you
can hand to a builder, architect, or kitchen fitter.

The output is a communication document, not a construction drawing. It says "this is roughly
the shape of the space and here are the numbers I measured." A professional takes it from there.

## Non-goals

Deliberately excluded, to keep the tool small:

- Multiple floors or levels
- Furniture, fixtures, appliances
- Room-level anything beyond name, shape and area (no finishes, no schedules of
  materials, no cost)
- Stairs, roofs, terrain
- 3D of any kind
- Cloud storage, accounts, collaboration
- True-scale printing (1:50, 1:100) and scale rulers
- DXF, DWG, IFC, or any CAD interchange format
- Drawing on mobile (mobile is view-only)

## Delivery

A static web app. No server, no accounts, no build-time backend. It can be hosted on any
static host or opened from a local build.

A project is a single `.floorplan.json` file on the user's disk. Where the File System Access
API is available the app offers real Save and Save As against a file handle; elsewhere it falls
back to `<a download>` for saving and `<input type="file">` for opening.

The app also autosaves the current project to `localStorage` on every change. This is a crash
net so a refresh or a closed tab never loses work. It is not storage — the JSON file on disk is
the artifact the user owns and shares.

## Stack

- Vite + React + TypeScript
- Zustand for state
- SVG for all rendering, drawn by React components
- `svg2pdf.js` + `jsPDF` for export
- Vitest + React Testing Library for tests

Rendering is SVG rather than Canvas so that screen and PDF share one code path. To export, the
app mounts the same React SVG components into an offscreen DOM node and hands the resulting
`<svg>` element to `svg2pdf.js`. There is no second drawing implementation that could drift out
of sync with what the user sees. A floor plan is tens of elements, not thousands, so SVG
performance is not a concern, and per-element `onClick` gives hit-testing for free.

A Canvas library (Konva, Fabric) was considered and rejected: it would give drag handles and
hit-testing out of the box, but the PDF would have to be drawn a second time with jsPDF
primitives, and keeping two renderers in agreement is the most likely source of "the PDF looks
wrong" bugs.

## Units

All geometry is stored as **integer millimetres**. The UI displays and accepts metres to two
decimal places. Integer millimetres avoid floating-point drift accumulating across chained
wall edits, and millimetre precision is far finer than anyone measures a flat with a tape.

## Data model

```ts
type NodeId = string
type WallId = string

type ProjectFile = {
  schema: "quickfloorplan/1"
  name: string
  defaultWallHeight: number      // mm
  nodes: Node[]
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  createdAt: string              // ISO 8601
  updatedAt: string              // ISO 8601
}

type Node = {
  id: NodeId
  x: number                      // mm, plan coordinates
  y: number                      // mm, plan coordinates
}

type Wall = {
  id: WallId
  a: NodeId                      // start
  b: NodeId                      // end
  thickness: number              // mm
  height?: number                // mm; falls back to project defaultWallHeight
  label: string                  // "A", "B", ... "Z", "AA", "AB"; see label assignment
}

type Opening = {
  id: string
  wallId: WallId
  kind: "door" | "window" | "passage"
  offset: number                 // mm from wall.a along the wall centreline, to opening CENTRE
  width: number                  // mm
  height: number                 // mm
  sill: number                   // mm above floor; 0 for doors, may be > 0 for passages
  hinge?: "a" | "b"              // doors only: which wall end the hinge is at
  swing?: "in" | "out"           // doors only: which side of the wall the leaf swings to
}

type Room = {
  id: string
  name: string                   // "Kitchen", "Dining", "Hall"
  polygon: { x: number, y: number }[]   // mm, plan coords, closed implicitly, CCW or CW
  tint: string                   // hex, from a light palette; user-changeable
}
```

### Opening kinds

`door` carries a hinge side and a swing direction and is drawn in plan with the usual
quarter-arc. `window` carries a sill height above the floor. `passage` is an opening with no
door in it — a cased opening, an archway, or a serving hatch — and is drawn in plan as a plain
break in the wall with no arc. A passage may have a sill above zero, which is what makes a
serving hatch between two rooms expressible rather than a special case.

### Wall labels

A new wall takes the first unused label in the sequence A, B, ... Z, AA, AB, ... A label is
never reassigned or compacted: deleting wall B leaves a gap, and the next new wall takes the
first free letter, not B. Labels are how the plan page and the elevation pages refer to each
other, and how the user cross-references a printout against the screen, so a wall's label must
not change under it.

### Why nodes are shared

Walls reference nodes by id rather than carrying their own endpoints. Two walls meeting at a
corner reference the same node, so dragging that corner moves both walls and the corner stays
closed. This is the single most important property of the model — endpoint duplication is what
makes naive floor plan editors fall apart.

### Angles are derived, not stored

The angle at a corner is computed from the two walls meeting there. Storing it as well would
create two sources of truth that can disagree. The properties panel shows the derived angle and
lets the user type a new one; the edit is applied as a geometry operation on the nodes.

### Numeric edits and closed loops

Typing a new length or angle rigidly transforms the downstream portion of the wall chain:
changing wall `A→B`'s length moves node `B` and everything after it, preserving all their
relative positions.

On a closed loop this is over-constrained — the chain no longer meets its own start. The tool
does **not** silently redistribute the error. It renders the gap and shows a badge on the plan
reading e.g. "loop open by 12 mm" until the user resolves it by editing another wall. Solving
closed loops properly requires a geometric constraint solver, which is out of scope; showing
the user the truth is both simpler and more honest than guessing which wall they meant.

### `swing` semantics

`swing: "in"` means the door leaf opens toward the left-hand side of the wall direction vector
`a → b`; `"out"` is the right-hand side. This is arbitrary but fixed, so the plan symbol and any
future consumer agree. The UI labels it with a visual toggle showing the arc, not the words
"in" and "out", because those are meaningless without a reference frame.

## Rooms

A room is a free polygon, drawn point-to-point, that is **not** derived from the walls. This is
the central decision and it is deliberate: in a real flat the boundary between a dining area and
a hall is often imaginary, and the two share the same four walls. Deriving rooms from wall
enclosures cannot express that. It would also be fragile — closed loops are allowed to have a
gap (see above), and a region-finding algorithm falls apart on a chain that does not quite meet.

Room polygons snap to wall faces and wall corners while being drawn, so the common case of "this
room is the whole enclosure" is a few clicks and lands exactly on the walls. Nothing forces them
to. Two rooms may share an edge that has no wall behind it, which is exactly how dining and hall
are distinguished.

**Area** is computed from the polygon with the shoelace formula and displayed in m² to one
decimal place. It is always derived, never stored or typed — a stored area could disagree with
the shape.

**Overlap is allowed but flagged.** Overlapping polygons double-count area, which is usually a
mistake, so overlapping rooms get a warning badge. Consistent with everything else in this tool,
it does not block saving or exporting.

**Tints** come from a fixed light palette, auto-assigned on creation and changeable. The palette
is constrained to tints light enough that black dimension text stays readable over them,
including when the PDF is printed on a greyscale printer — a plan whose numbers vanish under a
fill is worse than one with no colour at all.

### Which room does a wall belong to?

Elevation pages are titled with the room a wall faces, so this association has to be computed.
It is **derived, not stored**: a stored link would go stale the moment either the wall or the
room polygon moves.

A wall is associated with a room when at least 25% of the wall's centreline lies within
`wall.thickness / 2 + 150 mm` of the room polygon's boundary. The thickness term is there
because a snapped room edge runs along the wall's inner face, half a thickness off the
centreline; the 150 mm is slack for edges the user placed by eye. The 25% threshold stops a wall
that merely clips a room's corner from being tagged with it.

A wall may match several rooms — one on each side, or several along its length in an open plan —
and the elevation page lists all of them, e.g. "Wall C→D — Kitchen / Hall". A wall matching no
room is titled without a suffix.

## Modules

| Path | Responsibility | Depends on |
|---|---|---|
| `src/model/` | Types and pure geometry: wall length, corner angle, length/angle edits, loop gap, opening → elevation coordinate mapping, room area, room–wall association, polygon overlap, validation. No React, no DOM. | nothing |
| `src/state/` | Zustand store, undo/redo snapshot stack, localStorage autosave | `model` |
| `src/render/dimensions.ts` | Shared dimension-line primitives (extension lines, arrowheads, label placement) | `model` |
| `src/render/plan.tsx` | Top-down SVG: walls as thick strokes, door arcs, window symbols, dimension lines, node labels | `model`, `dimensions` |
| `src/render/elevation.tsx` | SVG for a single wall face | `model`, `dimensions` |
| `src/ui/` | Pan/zoom canvas wrapper, toolbar, properties panel, project menu, warning toasts | `state`, `render` |
| `src/export/pdf.ts` | Page assembly, offscreen SVG mount, svg2pdf + jsPDF | `render` |
| `src/file/` | Serialize, validate, load, save | `model` |

`src/model/` is pure and framework-free by design. It holds every piece of logic that can be
wrong in a way a user would notice, and it is testable without a DOM.

## Interactions

**Wall tool.** Click point to point to build a chain. Snaps to 15° increments and to existing
nodes within a magnet radius. A live length readout follows the cursor, and typing a number
mid-draw locks that exact length. Clicking the first node closes the loop; Escape, Enter, or
double-click ends the chain open.

**Select tool.** Clicking a wall opens a panel with its length, angle to the previous wall,
thickness, and height override. Clicking a node drags it. Clicking an opening shows its fields.

**Door / window / passage tools.** Click a wall; the opening is placed where clicked, then the
user types exact numbers.

**Room tool.** Click point to point to outline a room, snapping to wall faces and wall corners.
Enter, Escape, or clicking the first point closes the polygon. The panel then takes a name and a
tint, and shows the computed area. Room vertices are draggable afterwards with the select tool.

**Navigation.** Space-drag or middle-drag to pan, wheel to zoom, `F` to fit the plan to the
viewport, `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z` for undo and redo.

Undo/redo is a snapshot stack over the whole project, capped at 50 entries. Projects are small
enough that snapshotting is cheaper to build and to reason about than a command log.

## PDF export

A4 landscape throughout.

**Page 1 — top-down plan.** All wall lengths and corner angles dimensioned, walls labelled with
their stable letters, door swings drawn as quarter-arcs, windows as their standard symbol,
passages as plain breaks. Each room is filled with its tint and labelled with its name and
computed area (e.g. "Dining — 11.8 m²"). Where two rooms share an edge with no wall behind it,
that edge is drawn as a dashed line so the reader can see it is a notional boundary, not a
partition to build.

**Pages 2..n — one per wall, in label order.** Titled "Wall A→B — Kitchen", naming every room
the wall is associated with (see room–wall association above), or just "Wall A→B" if none.
Shows the wall face as a rectangle at its length and height, with each opening drawn in place
and dimensioned: distance along the wall, width, height, and sill height for windows and for
any passage with a sill.

Every page is scaled to fit within margins. The footer carries the project name, the export
date, "page x of y", and the text "Not to scale — all dimensions in metres."

All dimension text on both plan and elevation pages is written in metres to two decimal places,
matching what the user typed in. Millimetres are a storage detail and never surface in the UI
or the PDF.

The scale note matters: pages are fit-scaled, not drawn at 1:50, so measuring off the printout
would give wrong numbers. The note tells the reader to trust the dimension text and nothing else.

## Error handling

**Opening a file.** The JSON is validated against the schema before anything is applied. On
failure the app shows a toast naming the actual problem and leaves the current project
untouched. A corrupt file must never destroy work in progress.

**Geometry warnings.** An opening wider than its wall, an opening extending past a wall end, two
openings overlapping, an open loop, a self-intersecting room polygon, a room polygon with fewer
than three distinct vertices, or two rooms overlapping each produce a red highlight on the
offending element and a message in the properties panel. None of these block saving or exporting. The user is
sketching a real flat from tape measurements; the numbers will be inconsistent mid-edit, and a
tool that refuses to save until everything is perfect is a tool people abandon. It nags; it
never blocks.

**Export failure.** A toast with the underlying error. The project is untouched.

## Testing

The bulk of testing targets `src/model/`, with Vitest:

- Wall length and corner angle computation, including degenerate cases (zero-length wall,
  collinear neighbours)
- Length edits and angle edits: the downstream chain transforms rigidly, upstream is untouched
- Loop gap: closed loops report zero, broken loops report the correct distance
- Opening → elevation coordinate mapping in both directions
- Room area by shoelace, including a concave polygon and both vertex winding directions
- Room–wall association: a wall along a room edge matches, a wall clipping only its corner does
  not, a wall between two rooms matches both
- Room polygon self-intersection and room-versus-room overlap detection
- Serialize / deserialize round-trip preserves the project exactly
- Schema validation rejects malformed files with a useful message

Three React Testing Library tests cover the primary flow: draw a four-wall closed rectangle,
place a door on a wall and edit its numbers, and split that rectangle into two named rooms that
share an edge with no wall behind it.

PDF export is tested for page count and document structure — that a project with five walls
produces six pages, and that each elevation page receives an SVG containing the expected
elements. No pixel diffing; it is slow, brittle, and would fail on font differences rather than
on real regressions.
