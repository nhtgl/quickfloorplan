# QuickFloorPlan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app where a non-designer draws a flat's walls, angles, heights, openings and rooms, and exports a multi-page PDF handover document.

**Architecture:** A pure, framework-free geometry core (`src/model/`) holds every rule that can be wrong in a way a user notices, and is unit tested without a DOM. React renders the plan and elevations as SVG; the PDF exporter mounts those same SVG components offscreen and hands the resulting element to svg2pdf, so there is exactly one drawing implementation. State is a Zustand store with whole-project snapshot undo.

**Tech Stack:** Vite, React 18, TypeScript, Zustand, jsPDF + svg2pdf.js, Vitest + React Testing Library + jsdom.

## Global Constraints

- All geometry stored as **integer millimetres**. UI and PDF display **metres to 2dp**, areas in **m² to 1dp**. Millimetres never surface in UI or PDF text.
- Schema string is exactly `"quickfloorplan/1"`.
- `src/model/` imports nothing from React, the DOM, or the store. Enforced by review.
- Warnings never block saving or exporting. Every invalid geometry state is representable and persistable.
- Angles displayed in degrees, 1dp, measured as interior turn from the previous wall.
- Wall labels: first unused of A..Z, AA, AB, ...; never reassigned or compacted.
- Derived values (corner angle, room area, room-wall association) are computed on read, never stored.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Test: `src/model/units.test.ts`

**Interfaces:**
- Produces: `mmToM(mm: number): string`, `mToMm(m: number): number`, `mm2ToM2(mm2: number): string`, `formatDeg(deg: number): string` from `src/model/units.ts`.

- [ ] **Step 1:** `npm init -y`, install `react react-dom zustand jspdf svg2pdf.js` and dev deps `vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`.
- [ ] **Step 2:** Write `src/model/units.test.ts` asserting `mmToM(4200) === "4.20"`, `mToMm(4.2) === 4200`, `mToMm(4.204) === 4204` (rounds to integer mm), `mm2ToM2(11_800_000) === "11.8"`, `formatDeg(90) === "90.0"`.
- [ ] **Step 3:** Run `npx vitest run src/model/units.test.ts` — expect FAIL, module not found.
- [ ] **Step 4:** Implement `src/model/units.ts`.
- [ ] **Step 5:** Run again — expect PASS. Commit.

---

### Task 2: Core types and id generation

**Files:**
- Create: `src/model/types.ts`, `src/model/ids.ts`
- Test: `src/model/ids.test.ts`

**Interfaces:**
- Produces: all types from the spec's data model verbatim (`ProjectFile`, `Node`, `Wall`, `Opening`, `Room`, `Point`), plus `newId(prefix: string): string` and `nextWallLabel(existing: string[]): string`.

- [ ] **Step 1:** Test `nextWallLabel([]) === "A"`, `nextWallLabel(["A","B"]) === "C"`, `nextWallLabel(["A","C"]) === "B"` is WRONG — assert it returns `"B"` only if B is free; with `["A","C"]` the first unused is `"B"`, so expect `"B"`. Assert 26 labels then `nextWallLabel(A..Z) === "AA"`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Label sequence is base-26 bijective (A..Z, AA..AZ, BA..).
- [ ] **Step 4:** Run — PASS. Commit.

---

### Task 3: Wall geometry — lengths, angles, edits, loop gap

**Files:**
- Create: `src/model/geometry.ts`
- Test: `src/model/geometry.test.ts`

**Interfaces:**
- Produces:
  - `wallLength(p: Project, wallId: string): number` (mm)
  - `wallAngleDeg(p: Project, wallId: string): number | null` — turn from previous wall in the chain, null if no previous
  - `wallVector(p, wallId): Point`
  - `setWallLength(p: Project, wallId: string, mm: number): Project` — rigidly moves node b and all downstream nodes
  - `setWallAngleDeg(p: Project, wallId: string, deg: number): Project` — rotates the downstream chain about node a
  - `loopGap(p: Project, chainStartWallId: string): number` — 0 if closed
  - `chainFrom(p, wallId): string[]` — wall ids downstream, following shared nodes
- Consumes: Task 2 types.

- [ ] **Step 1:** Tests: unit square 4200x3100 has `wallLength === 4200`; `wallAngleDeg` at each corner is 90; `setWallLength(A, 5000)` moves B and C but not D-side origin; collinear neighbours give angle 0; zero-length wall gives angle `null` rather than NaN; closing a square gives `loopGap === 0`; after `setWallLength` on a closed square `loopGap === 800`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement with integer mm rounding at every write.
- [ ] **Step 4:** Run — PASS. Commit.

---

### Task 4: Room geometry — area, validity, wall association

**Files:**
- Create: `src/model/rooms.ts`
- Test: `src/model/rooms.test.ts`

**Interfaces:**
- Produces:
  - `roomArea(room: Room): number` — mm², shoelace, absolute value so winding does not matter
  - `polygonSelfIntersects(poly: Point[]): boolean`
  - `roomsOverlap(a: Room, b: Room): boolean`
  - `wallsForRoom(p: Project, roomId: string): string[]`
  - `roomsForWall(p: Project, wallId: string): string[]`
  - `ROOM_MATCH_FRACTION = 0.25`, `ROOM_MATCH_SLACK_MM = 150`

- [ ] **Step 1:** Tests: 4200x3100 rectangle area is 13_020_000 mm²; reversed winding gives the same; an L-shaped concave polygon gives the correct area; a bowtie polygon self-intersects; a wall lying along a room edge is matched; a wall touching only the room's corner is not; a wall with rooms on both sides matches both.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Association: sample the wall centreline at 1% steps, count the fraction whose distance to the polygon boundary is `<= wall.thickness/2 + 150`.
- [ ] **Step 4:** Run — PASS. Commit.

---

### Task 5: Openings — placement, elevation mapping, validation

**Files:**
- Create: `src/model/openings.ts`, `src/model/validate.ts`
- Test: `src/model/openings.test.ts`, `src/model/validate.test.ts`

**Interfaces:**
- Produces:
  - `openingRect(p, openingId): { x: number, y: number, w: number, h: number }` — coords on the wall elevation, x from wall.a, y from floor
  - `openingPlanSegment(p, openingId): { from: Point, to: Point }`
  - `doorSwingArc(p, openingId): { cx, cy, r, startDeg, endDeg, hingeAtA: boolean } | null`
  - `projectWarnings(p: Project): Warning[]` where `Warning = { kind, targetId, message }`
- Warning kinds: `opening-too-wide`, `opening-past-end`, `openings-overlap`, `loop-open`, `room-self-intersects`, `room-degenerate`, `rooms-overlap`.

- [ ] **Step 1:** Tests: an opening at offset 900 width 1200 gives `openingRect.x === 300`; a window sill 900 height 1400 gives `y === 900, h === 1400`; an opening wider than its wall yields `opening-too-wide`; two overlapping openings yield one `openings-overlap`; a valid project yields `[]`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

---

### Task 6: File serialization

**Files:**
- Create: `src/file/serialize.ts`, `src/file/validateFile.ts`, `src/file/io.ts`
- Test: `src/file/serialize.test.ts`

**Interfaces:**
- Produces: `serialize(p: Project): string`, `deserialize(json: string): { ok: true, project: Project } | { ok: false, error: string }`, `emptyProject(name: string): Project`, and from `io.ts`: `saveProject(p)`, `openProject()` using File System Access API with anchor-download / file-input fallback.

- [ ] **Step 1:** Tests: round-trip preserves a project with walls, openings and rooms exactly; missing `schema` gives `ok: false` naming the field; wrong schema version gives a message naming the version found; malformed JSON gives `ok: false` and does not throw.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

---

### Task 7: Store with undo and autosave

**Files:**
- Create: `src/state/store.ts`, `src/state/autosave.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Produces a Zustand store exposing `project`, `selection`, `tool`, `apply(fn: (p: Project) => Project)`, `undo()`, `redo()`, `select(sel)`, `setTool(t)`. Snapshot stack capped at 50.

- [ ] **Step 1:** Tests: `apply` pushes onto the undo stack; `undo` restores the prior project; `redo` reapplies; the stack caps at 50; a new `apply` after `undo` clears the redo stack.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

---

### Task 8: SVG renderers — dimensions, plan, elevation

**Files:**
- Create: `src/render/dimensions.tsx`, `src/render/PlanSvg.tsx`, `src/render/ElevationSvg.tsx`, `src/render/theme.ts`
- Test: `src/render/PlanSvg.test.tsx`, `src/render/ElevationSvg.test.tsx`

**Interfaces:**
- Produces: `<DimLine from to label offset />`, `<PlanSvg project width height showRooms showDims />`, `<ElevationSvg project wallId width height />`, and `ROOM_TINTS: string[]` (light, greyscale-safe).
- Both page components accept explicit `width`/`height` in points so the PDF exporter can size them per page.

- [ ] **Step 1:** Tests: rendering a 4-wall project produces 4 wall paths and 4 dimension labels reading `"4.20"` etc; a room renders a `<polygon>` with its tint and a label containing its name and `"13.0 m²"`; an elevation for a wall with one window renders a wall rect plus one opening rect; a shared room edge with no wall behind it renders with `stroke-dasharray`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

---

### Task 9: Canvas, tools, properties panel

**Files:**
- Create: `src/ui/Canvas.tsx`, `src/ui/Toolbar.tsx`, `src/ui/Properties.tsx`, `src/ui/Warnings.tsx`, `src/ui/useViewport.ts`, `src/ui/snapping.ts`
- Modify: `src/App.tsx`
- Test: `src/ui/flows.test.tsx`

**Interfaces:**
- Consumes everything above.
- `snapping.ts` produces `snapPoint(p: Project, raw: Point, opts): Point` (node magnet then 15° angle lock) and `SNAP_RADIUS_MM = 250`.

- [ ] **Step 1:** Three flow tests: draw a four-wall closed rectangle and assert 4 walls and `loopGap === 0`; place a door on a wall, edit its width, assert the model updated; draw two rooms sharing an edge with no wall behind it and assert both exist with distinct areas.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.

---

### Task 10: PDF export

**Files:**
- Create: `src/export/pdf.ts`
- Test: `src/export/pdf.test.ts`

**Interfaces:**
- Produces: `exportPdf(project: Project): Promise<Blob>` and `pageTitles(project): string[]`.
- Renders each page component into an offscreen container with `createRoot` + `flushSync`, passes the `<svg>` to `svg2pdf`, then unmounts.

- [ ] **Step 1:** Tests: a 5-wall project yields 6 page titles; page 1 is `"Floor Plan"`; an elevation page for a wall in the Kitchen is titled `"Wall A→B — Kitchen"`; a wall matching two rooms is titled with both joined by `" / "`; a wall matching none has no suffix.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Commit.
