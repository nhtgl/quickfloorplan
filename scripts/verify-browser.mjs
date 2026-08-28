/**
 * Real-browser check for the one thing jsdom cannot cover: PDF export.
 * jsdom has no SVG layout, so svg2pdf reads null coordinates there. This drives the
 * built app in Chromium, exports a PDF, and checks the pages actually came out.
 *
 * Usage: npm run build && node scripts/verify-browser.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const createDeflate = (buf) => deflateSync(buf);
import { extname, join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const OUT = new URL("../.verify/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

/** Minimal uncompressed-deflate PNG, so the script needs no image library. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 140;
    }
  }
  const zlib = createDeflate(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
// Point at an already-running instance to check a built container, rather than the
// local dist: BASE_URL=http://localhost:8080 node scripts/verify-browser.mjs
const external = process.env.BASE_URL;
if (!external) await new Promise((r) => server.listen(0, r));
const base = external ?? `http://localhost:${server.address().port}`;

const project = {
  schema: "quickfloorplan/1",
  name: "Verification Flat",
  units: "cm",
  measureFrom: "inside",
  defaultWallHeight: 2600,
  nodes: [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 5200, y: 0 },
    { id: "n3", x: 5200, y: 3400 },
    { id: "n4", x: 0, y: 3400 },
  ],
  walls: [
    { id: "w1", a: "n1", b: "n2", thickness: 120, label: "A" },
    { id: "w2", a: "n2", b: "n3", thickness: 120, label: "B" },
    { id: "w3", a: "n3", b: "n4", thickness: 120, label: "C" },
    { id: "w4", a: "n4", b: "n1", thickness: 120, label: "D" },
  ],
  openings: [
    { id: "o1", wallId: "w1", kind: "window", offset: 1600, width: 1400, height: 1500, sill: 850 },
    { id: "o2", wallId: "w1", kind: "window", offset: 3800, width: 1000, height: 1500, sill: 850 },
    { id: "o3", wallId: "w4", kind: "door", offset: 1700, width: 900, height: 2050, sill: 0, hinge: "a", swing: "in" },
    { id: "o4", wallId: "w2", kind: "door", offset: 1700, width: 1100, height: 2100, sill: 0, hinge: "a", swing: "in" },
  ],
  rooms: [
    { id: "r1", name: "Hall", tint: "#e8f0fe",
      polygon: [{ x: 0, y: 0 }, { x: 1800, y: 0 }, { x: 1800, y: 3400 }, { x: 0, y: 3400 }] },
    { id: "r2", name: "Dining", tint: "#e6f4ea",
      polygon: [{ x: 1800, y: 0 }, { x: 5200, y: 0 }, { x: 5200, y: 3400 }, { x: 1800, y: 3400 }] },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Uses the system Chrome so this needs no extra browser download.
// A 2400x1800 source image, big enough to prove the downscale on import.
const photoPath = join(OUT, "reference.png");
await mkdir(OUT, { recursive: true });
await writeFile(photoPath, makePng(2400, 1800));

// Locally this uses the system Chrome, so there is no browser to download. CI sets
// PLAYWRIGHT_CHANNEL=chromium to use Playwright's own build instead.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
const browser = await chromium.launch(
  channel === "chromium" ? {} : { channel },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));


await page.goto(base);
await page.evaluate((p) => {
  localStorage.setItem("quickfloorplan.autosave.v1", JSON.stringify(p));
}, project);
await page.reload();
await page.waitForSelector('[data-testid="plan-svg"]');
await page.keyboard.press("f");
await page.waitForTimeout(300);

await mkdir(OUT, { recursive: true });
await page.screenshot({ path: join(OUT, "app.png") });

const walls = await page.locator('[data-testid="wall"]').count();
const wallLabels = await page.locator('[data-testid="wall-label"]').allTextContents();
const angleLabels = await page.locator('[data-testid="angle-label"]').count();
const rooms = await page.locator('[data-testid="room-fill"]').count();
const notional = await page.locator('[data-testid="notional-edge"]').count();
const doorArcs = await page.locator('[data-testid="door-arc"]').count();

// Select a wall and confirm its openings are listed in the panel.
await page.getByRole("button", { name: "Select" }).click();
// A bare SVG <line> has a zero-height bounding box, which Playwright reads as
// invisible, so dispatch the click straight at the element.
await page.locator('[data-testid="wall"]').first().dispatchEvent("click");
const openingRows = await page.locator('[data-testid="opening-row"]').allTextContents();
await page.screenshot({ path: join(OUT, "wall-selected.png") });

const dimLabels = await page.locator('[data-testid="dim-label"]').allTextContents();
const chainSegs = await page.locator('[data-kind="opening"]').count();
// Wall A's chain is the first five labels; they must add up to its stated length.
const chainSum = (await page.locator('[data-kind]').evaluateAll((els) =>
  els
    .slice(0, 5)
    .map((e) => Number((e.querySelector("text")?.textContent ?? "0").replace(/[^0-9.-]/g, ""))),
)).reduce((a, b) => a + b, 0);
const zoomIn = await page.getByRole("button", { name: "Zoom in" }).count();
const fitBtn = await page.getByRole("button", { name: "Fit plan to view" }).count();
const panTool = await page.getByRole("button", { name: "Pan" }).count();

// A wall shows three lines: a face each side and the centreline between them.
const centrelines = await page.locator('.stage [data-testid="wall-centreline"]').count();
// The seeded project is written in the old single-thickness form, so opening it at all
// proves the migration works.
const migrated = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  return raw.walls[0].offsets;
});


const wallCount = await page.locator('.stage [data-testid="wall"]').count();

// Drawing can catch an existing wall's face, not just its centreline corner.
const faceCorner = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  const w = raw.walls[0];
  const a = raw.nodes.find((n) => n.id === w.a);
  const b = raw.nodes.find((n) => n.id === w.b);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const half = w.thickness / 2;
  const svg = document.querySelector('[data-testid="plan-svg"]');
  const p = svg.createSVGPoint();
  p.x = a.x + nx * half + ((b.x - a.x) / len) * half;
  p.y = a.y + ny * half + ((b.y - a.y) / len) * half;
  const s = p.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
});

const planBox = await page.locator('[data-testid="plan-svg"]').boundingBox();
await page.getByRole("button", { name: "Wall", exact: true }).click();
await page.mouse.click(planBox.x + planBox.width * 0.5, planBox.y + planBox.height * 0.85);
await page.mouse.move(faceCorner.x, faceCorner.y);
await page.waitForTimeout(120);
const snapKind = await page
  .locator('[data-testid="snap-marker"]')
  .getAttribute("data-kind")
  .catch(() => null);
await page.screenshot({ path: join(OUT, "face-snap.png") });
await page.keyboard.press("Escape");

// Each face of a wall is edited on its own.
await page.getByRole("button", { name: "Select" }).click();
await page.locator('[data-wall-label="A"]').first().dispatchEvent("click");
const faceFields = await page.locator('[data-testid="wall-faces"] input').count();
const lengthFields = await page.locator('[data-testid="wall-lengths"] input').count();
const lengthLabels = await page
  .locator('[data-testid="wall-lengths"] .field > span:first-child')
  .allTextContents();
// Typing a length against one line must move the other two by the same amount.
const linesBefore = await page
  .locator('[data-testid="wall-lengths"] input')
  .evaluateAll((els) => els.map((e) => Number(e.value)));
const outerField = page.locator('[data-testid="wall-lengths"] input').last();
await outerField.fill("450");
await outerField.blur();
await page.waitForTimeout(150);
const linesAfter = await page
  .locator('[data-testid="wall-lengths"] input')
  .evaluateAll((els) => els.map((e) => Number(e.value)));
const shifts = new Set(linesAfter.map((v, i) => v - linesBefore[i]));
const beforeFaces = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  return raw.walls.find((w) => w.label === "A").offsets;
});
const firstFace = page.locator('[data-testid="wall-faces"] input').first();
await firstFace.fill("30");
await firstFace.blur();
await page.waitForTimeout(150);
const afterFaces = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  return raw.walls.find((w) => w.label === "A").offsets;
});
await page.screenshot({ path: join(OUT, "wall-faces.png") });

// Backspace takes back the last corner while drawing.
// "Wall" would also match the panel's "Delete wall" button.
await page.getByRole("button", { name: "Wall", exact: true }).click();
const svgBox = await page.locator('[data-testid="plan-svg"]').boundingBox();
for (const [dx, dy] of [[0.3, 0.3], [0.5, 0.3], [0.5, 0.5]]) {
  await page.mouse.click(svgBox.x + svgBox.width * dx, svgBox.y + svgBox.height * dy);
}
const beforeBackspace = await page.locator('[data-testid="draft-point"]').count();
await page.keyboard.press("Backspace");
const afterBackspace = await page.locator('[data-testid="draft-point"]').count();

// Drift onto the column of an existing corner: a guide should appear and snap the point.
// Ask the SVG itself where plan (0,0) — a real corner of the flat — lands on screen.
const corner = await page.evaluate(() => {
  const svg = document.querySelector('[data-testid="plan-svg"]');
  const p = svg.createSVGPoint();
  p.x = 0;
  p.y = 0;
  const s = p.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
});
await page.mouse.move(svgBox.x + svgBox.width * 0.5, svgBox.y + svgBox.height * 0.75);
await page.mouse.move(corner.x + 2, svgBox.y + svgBox.height * 0.85);
await page.waitForTimeout(250);
const guideCount = await page.locator('[data-testid="align-guide"]').count();
await page.screenshot({ path: join(OUT, "align-guide.png") });

await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Select" }).click();

// Build a room by typing measurements, and look at the live preview.
await page.getByRole("button", { name: "Room from sizes…" }).click();
await page.getByTestId("measurements-input").fill("250,90,328,90,250,90,328,90");
await page.waitForTimeout(150);
const readout = await page.getByTestId("measurement-readout").textContent();
await page.screenshot({ path: join(OUT, "measurements-dialog.png") });
const wallsBefore = await page.locator('.stage [data-testid="wall"]').count();
await page.getByRole("button", { name: "Create" }).click();
await page.waitForTimeout(150);
const wallsAfter = await page.locator('.stage [data-testid="wall"]').count();
const typedRoomArea = await page
  .locator('.stage [data-testid="room-label"]')
  .last()
  .textContent();
// The new room lands clear of existing work, so the view must refit to show it.
const typedRoomVisible = await page
  .locator('.stage [data-testid="room-fill"]')
  .last()
  .isVisible();
await page.screenshot({ path: join(OUT, "typed-room.png") });

// Add a real photo through the real import path (canvas resize included).
await page.getByRole("button", { name: "Photos…" }).click();
await page.getByTestId("photo-input").setInputFiles(photoPath);
await page.waitForSelector('[data-testid="photo-row"]');
await page.getByLabel("Caption for reference.png").fill("Kitchen, looking north");
const photoRows = await page.locator('[data-testid="photo-row"]').count();
const storedPhoto = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  const ph = raw.photos[0];
  return { w: ph.width, h: ph.height, jpeg: ph.dataUrl.startsWith("data:image/jpeg") };
});
await page.screenshot({ path: join(OUT, "photos-dialog.png") });
await page.getByRole("button", { name: "Done" }).click();

// Drag the typed room onto the flat and check it snaps flush.
await page.getByRole("button", { name: "Select" }).click();
const roomEdges = () =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
    const ids = new Set(
      raw.walls.filter((w) => ["E", "F", "G", "H"].includes(w.label)).flatMap((w) => [w.a, w.b]),
    );
    const xs = raw.nodes.filter((n) => ids.has(n.id)).map((n) => n.x);
    const others = raw.nodes.filter((n) => !ids.has(n.id)).map((n) => n.x);
    return { movingLeft: Math.min(...xs), stationaryRight: Math.max(...others) };
  });

const edgesBefore = await roomEdges();
const movingWall = page.locator('[data-wall-label="E"]').first();
const grab = await movingWall.boundingBox();
await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
await page.mouse.down();
// Aim the room's left edge at the other room's right edge, a shade short of it.
const svgScale = await page.evaluate(() => {
  const svg = document.querySelector('[data-testid="plan-svg"]');
  const box = svg.getBoundingClientRect();
  return svg.viewBox.baseVal.width / box.width;
});
const wantedPx = (edgesBefore.stationaryRight - edgesBefore.movingLeft) / svgScale + 3;
await page.mouse.move(grab.x + grab.width / 2 + wantedPx, grab.y + grab.height / 2, { steps: 8 });
const dragGuides = await page.locator('[data-testid="align-guide"]').count();
await page.mouse.up();
await page.waitForTimeout(150);
const edgesAfter = await roomEdges();
const openingsAfter = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("quickfloorplan.autosave.v1"));
  return { total: raw.openings.length };
});
// Arcs are counted again after the move: the original front door plus the shared one,
// each drawn once. A third would mean the shared view had produced a reflection.
const arcsAfterMove = await page.locator('.stage [data-testid="door-arc"]').count();
const sharedCuts = await page.locator('.stage [data-testid="shared-opening-cut"]').count();
await page.screenshot({ path: join(OUT, "rooms-snapped.png") });

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "Export PDF" }).click(),
]);
const pdfPath = join(OUT, "verification.pdf");
await download.saveAs(pdfPath);

const pdf = await readFile(pdfPath);
const text = pdf.toString("latin1");
const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

const checks = [
  ["4 walls drawn", walls === 4],
  ["2 rooms filled", rooms === 2],
  ["shared room boundary drawn dashed, once per room", notional === 2],
  // The front door and the door in the wall the second room will come to share.
  ["both doors draw a swing arc", doorArcs === 2],
  ["every wall labelled A-D", wallLabels.join("") === "ABCD"],
  ["square corners not labelled with 90 degrees", angleLabels === 0],
  ["PDF starts with %PDF-", text.startsWith("%PDF-")],
  ["PDF larger than 5kB", pdf.length > 5000],
  ["wall A panel lists its 2 windows", openingRows.length === 2 && openingRows.every((t) => t.includes("Window"))],
  ["zoom, fit and pan controls present", zoomIn === 1 && fitBtn === 1 && panTool === 1],
  // Centrelines are 520 x 340 with 12cm walls, so inside faces read 508 x 328.
  ["wall lengths read from inside faces", dimLabels.includes("508 cm") && dimLabels.includes("328 cm")],
  ["dimensions read in centimetres", !dimLabels.some((t) => t.includes(" m"))],
  ["chain sums to the inside length", chainSum === 508],
  ["setting-out chain marks each opening", chainSegs === 4],
  ["backspace takes back the last corner", beforeBackspace === 3 && afterBackspace === 2],
  ["an alignment guide appears when lining up with a corner", guideCount > 0],
  ["typed measurements close exactly", (readout ?? "").includes("Closes exactly")],
  ["creating adds four walls", wallsAfter - wallsBefore === 4],
  ["typed room reports 8.2 m2 of floor", (typedRoomArea ?? "").includes("8.2 m²")],
  ["the new room is brought into view", typedRoomVisible],
  ["a photo imports and is listed", photoRows === 1],
  // 2400x1800 source, scaled to fit a 1400px box and re-encoded as JPEG.
  ["photos are downscaled and re-encoded", storedPhoto.w === 1400 && storedPhoto.h === 1050 && storedPhoto.jpeg],
  ["PDF gains a sketch page and a photo page", pages === 11],
  ["dragging a room shows a snap guide", dragGuides > 0],
  ["the dragged room lands flush against the other", edgesAfter.movingLeft === edgesAfter.stationaryRight],
  ["no second door is created when rooms meet", openingsAfter.total === 4],
  ["the shared wall cuts its own gap so the door still shows", sharedCuts >= 1],
  ["each door drawn once, so none is mirrored", arcsAfterMove === 2],
  ["every wall shows its centreline as well as its two faces", centrelines === wallCount && wallCount > 0],
  ["a file written with the old single thickness still opens", migrated.left === 60 && migrated.right === 60],
  ["each face has its own field", faceFields === 2],
  ["each of the three lines has its own length field", lengthFields === 3],
  ["the lines are named, not just left and right", lengthLabels.includes("Centreline")],
  ["typing one length shifts all three by the same amount", shifts.size === 1 && [...shifts][0] !== 0],
  ["editing one face leaves the other alone", afterFaces.left === 300 && afterFaces.right === beforeFaces.right],
  ["drawing catches a wall face, not only its centreline", snapKind === "face"],
  ["no page or console errors", problems.length === 0],
];

await writeFile(join(OUT, "report.txt"), checks.map(([n, ok]) => `${ok ? "PASS" : "FAIL"} ${n}`).join("\n"));
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (problems.length) console.log("\nProblems:\n" + problems.join("\n"));
console.log(`\npdf: ${pdfPath} (${pdf.length} bytes, ${pages} pages)`);
console.log(`screenshot: ${join(OUT, "app.png")}`);

await browser.close();
if (!external) server.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
