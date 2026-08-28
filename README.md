# QuickFloorPlan

Sketch the walls of a flat, type in the measurements you took with a tape, mark the doors
and windows, outline the rooms, and export a PDF you can hand to a builder, architect, or
kitchen fitter.

It is a communication document, not a construction drawing. It says "this is roughly the
shape of the space and here are the numbers I measured." A professional takes it from there.

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit and component tests
npm run verify   # builds, then drives the real app in Chrome and checks the PDF
```

## Using it

Pick the **Wall** tool and click corner to corner. Lengths snap to 15° increments and to
existing corners; hold **Alt** to draw at a free angle. Click the first corner to close a
loop, or press **Enter** to finish an open run.

Select any wall to type its exact length, its angle to the previous wall, its thickness and
a height override. The same panel lists every door, window and opening in that wall with its
position and size, so you can find and edit one without hunting for its symbol on the plan,
and add or remove them from there. **Door**, **Window** and **Opening** also place a fitting
on whichever wall you click. **Room** outlines an area.

Measurements are in **centimetres** by default, which is how a tape gets read and written
down. The Units control in the toolbar switches the whole project to metres. Room areas stay
in m² either way, because a room in square centimetres is a six-digit number nobody can read.

Walls are drawn on their centrelines, but a stated length can run between whichever faces
you actually measured. The **Measure** control offers **inside faces** (the default, since a
tape held across a room gives the clear internal distance), **centrelines**, or **outside
faces**. Type the number you measured and the tool works out where the centreline has to go.

At a corner a wall's face stops where it meets its neighbour's, so the correction uses the
neighbour's thickness and the angle between them — half a thickness at a square corner, more
at a sharp one. A wall that is not part of a closed run has no inside, so it falls back to
its centreline rather than inventing a side.

Zoom and fit buttons sit at the bottom right of the canvas. The **Pan** tool drags the view,
and shift-drag or middle-drag pans with any tool selected.

Keys: `V` select, `H` pan, `W` wall, `D` door, `N` window, `P` opening, `R` room, `F` fit to
view, `Cmd/Ctrl+Z` undo. The wheel zooms.

Projects are `.floorplan.json` files on your disk. The app also autosaves to the browser so
a refresh never loses work, but the file is the thing you own and share.

## Three decisions worth knowing about

**Rooms are free polygons, not derived from the walls.** A dining area and a hall often
share the same four walls with nothing but an imaginary line between them. Rooms snap to
wall faces while you draw, so the common case is quick, but nothing forces them to follow
walls. An edge with no wall behind it draws dashed on the plan, so nobody quotes for a
partition that was never there.

**Typing a measurement can open a closed loop, and the tool shows you.** Changing a wall's
length moves everything downstream of it. Go all the way round a closed loop and the shape
no longer meets itself. Rather than quietly stretching the last wall to absorb the error,
the corner comes apart by exactly the amount your edit demanded and the plan badges it as
"open by 0.80 m" until you fix it. Drag the loose end back onto its partner, or adjust
another wall.

**Warnings never block.** An opening wider than its wall, two openings overlapping, rooms
that double-count area: all of these are flagged and none of them stop you saving or
exporting. Numbers taken off a tape are inconsistent halfway through, and a tool that
refuses to save until everything is perfect is a tool people abandon.

## The PDF

Page 1 is the plan: every wall dimensioned and lettered, rooms tinted with names and areas,
door swings drawn. Then one page per wall, titled with the rooms it faces ("Wall C — Kitchen
/ Hall"), showing that wall face on with each opening's height and sill.

Any wall with an opening in it carries a **setting-out chain**: corner to the first opening,
the opening itself, the solid stretch to the next, and so on to the far corner, with the
overall length outside it. The segments tile the wall end to end, so the chain adds up to the
overall — which is what lets someone check it against a tape on site. The chain runs between
the same faces as the overall, so switching between inside and outside moves both together. Openings are picked out
in blue. Overlapping openings are merged into one segment rather than listed separately: a
chain that does not add up is worse than no chain, and the overlap is already flagged as a
warning.

Pages are scaled to fit, not drawn at 1:50, so the footer says so. Read the numbers, don't
measure the printout.

## Layout

| Path | What lives there |
|---|---|
| `src/model/` | Pure geometry and rules. No React, no DOM. Where the real tests are. |
| `src/state/` | Store, undo history, autosave |
| `src/render/` | The SVG components, used by both the screen and the PDF |
| `src/ui/` | Canvas, tools, panels |
| `src/export/` | PDF assembly |
| `src/file/` | Save, open, validate |

The screen and the PDF share one set of SVG components. To export, those components are
mounted into an offscreen DOM node and the resulting `<svg>` is handed to svg2pdf. There is
no second drawing implementation to drift out of sync with what you approved on screen.

## Testing

`npm test` covers the geometry, the room maths, validation, the store, the renderers and the
main drawing flows.

It does **not** cover PDF export. jsdom implements no SVG layout — no `getBBox`, no
`SVGTextElement.x.baseVal` — so svg2pdf reads null coordinates there and every text run
fails. Stubbing that would only test the stubs. `npm run verify` builds the app, drives it in
Chrome, exports a real PDF and checks the pages that come out. Run it before trusting a
change to anything under `src/render/` or `src/export/`.
