# QuickFloorPlan

Measure a flat with a tape, type the numbers in, and export a PDF a builder can work from.

[![CI](https://github.com/nhtgl/quickfloorplan/actions/workflows/ci.yml/badge.svg)](https://github.com/nhtgl/quickfloorplan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## This is not a visualisation tool

It will not show you what your flat looks like. There is no 3D, no rendering, no materials,
no furniture, no lighting, no colours beyond flat tints for telling one room from another.
The drawings are deliberately plain, and they are not to scale — the printed page is fitted
to the paper, so measuring off it gives the wrong answer.

**The numbers are the product.** Everything here exists to get measurements out of your head
and onto a page that someone else can build from: wall lengths, the angles between them,
ceiling heights, and where the doors and windows sit along each wall. If you want to see
your flat, use something else. If you want to tell a kitchen fitter that the wall is 3.42 m
and the window starts 90 cm along it, this is the tool.

It is meant for people who are not designers, and its output is a starting point for a
professional, not a construction drawing.

## Run it

```bash
docker run -p 8080:8080 ghcr.io/nhtgl/quickfloorplan:latest
```

Then open <http://localhost:8080>. That is the whole thing: no accounts, no database, no
network calls. Images are published for amd64 and arm64.

With Compose:

```bash
curl -O https://raw.githubusercontent.com/nhtgl/quickfloorplan/main/docker-compose.yml
docker compose up -d
```

Or from source:

```bash
npm install
npm run dev      # http://localhost:5173
```

## Your data stays yours

Projects are `.floorplan.json` files on your own disk. Nothing is uploaded anywhere, there
is no telemetry, and the container serves static files and talks to nothing. Reference
photos are stored inside the project file, so a project stays one thing you can send to
someone.

The app also autosaves to your browser so a refresh never loses work, but that is a crash
net, not storage. The file on disk is the artifact you own.

## Using it

Pick the **Wall** tool and click corner to corner. Lengths snap to 15° increments and to
existing corners. A pink guide appears when the corner you are placing lines up with an
existing one on either axis, and the corner snaps to that line; two guides at once put it on
the intersection. Hold **Alt** to switch all of that off and draw freely. **Backspace** takes back the last
corner if you misplace one, **Enter** finishes an open run, and clicking the first corner
closes a loop. **Escape** abandons the run.

Select any wall to type its exact length, its angle to the previous wall, its thickness and
a height override. The same panel lists every door, window and opening in that wall with its
position and size, so you can find and edit one without hunting for its symbol on the plan,
and add or remove them from there. **Door**, **Window** and **Opening** also place a fitting
on whichever wall you click. **Room** outlines an area.

**Room from sizes…** builds a whole room from numbers you type. Enter each wall and the turn
after it — `250, 90, 100, 90, 250, 90, 100, 90` is a 250 wall, a quarter turn, a 100 wall, and
so on round. A negative turn goes the other way, for a room that steps back on itself, and
ticking *every corner is square* lets you type lengths alone. A live preview shows the shape
before anything is added, says whether it closes, and reports the floor area. Lengths are read
as whatever the Measure control says, so typed inside dimensions come out as inside dimensions.

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
view, `Backspace` take back a corner, `Cmd/Ctrl+Z` undo. The wheel zooms.

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

**Photos…** attaches reference photos. They are scaled down on the way in and stored inside
the project file, so a project stays one thing you can send to someone. Each gets its own page
at the back of the PDF, titled by its caption. The dialog shows the running file size and says
so when the photos are making the file awkward to email.

## The PDF

Page 1 is the plan: every wall dimensioned and lettered, rooms tinted with names and areas,
door swings drawn.

Page 2 is the same plan stripped back to walls and openings — no dimensions, no room tints, no
wall letters — for sketching a layout on by hand. Whatever gets drawn over it stays readable
because there is nothing underneath competing with it.

Then one page per wall, titled with the rooms it faces ("Wall C — Kitchen
/ Hall"), showing that wall face on with each opening's height and sill.

Any wall with an opening in it carries a **setting-out chain**: corner to the first opening,
the opening itself, the solid stretch to the next, and so on to the far corner, with the
overall length outside it. The segments tile the wall end to end, so the chain adds up to the
overall — which is what lets someone check it against a tape on site. The chain runs between
the same faces as the overall, so switching between inside and outside moves both together. Openings are picked out
in blue. Overlapping openings are merged into one segment rather than listed separately: a
chain that does not add up is worse than no chain, and the overlap is already flagged as a
warning.

Reference photos come last, one to a page.

Pages are scaled to fit, not drawn at 1:50, so the footer says so. Read the numbers, don't
measure the printout.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit and component tests
npm run verify   # builds, then drives the real app in Chrome and checks the PDF
npm run build    # type-check and produce dist/
```

`npm run verify` uses the Chrome already on your machine, so there is no browser to
download. Set `BASE_URL` to point it at something already running — a container, say:

```bash
docker run -d -p 8080:8080 quickfloorplan
BASE_URL=http://localhost:8080 node scripts/verify-browser.mjs
```

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

## Building the container yourself

```bash
docker build -t quickfloorplan .
docker run -p 8080:8080 quickfloorplan
```

It is a two-stage build: Node compiles the app, then nginx serves the result. The runtime
image is about 78 MB, listens on 8080 and runs as a non-root user. A strict
Content-Security-Policy confines the page to its own origin, which it can afford to do
because it never talks to anything.

## Contributing

Bug reports and pull requests are welcome. Two things worth knowing before you change
anything:

- `src/model/` is pure and has no React or DOM imports. Every rule that can be wrong in a
  way a user would notice lives there, and it is tested without a browser. Keep it that way.
- If you touch `src/render/` or `src/export/`, run `npm run verify`. The unit suite does not
  cover PDF output and cannot, for the reason given above.

Run `npm test` and `npx tsc --noEmit` before opening a pull request. CI runs both, plus the
browser checks and a container build.

## Licence

MIT. See [LICENSE](LICENSE).
