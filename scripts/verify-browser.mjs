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
import { extname, join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const OUT = new URL("../.verify/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

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
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

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
    { id: "o4", wallId: "w2", kind: "passage", offset: 1700, width: 1100, height: 2100, sill: 0 },
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
const browser = await chromium.launch({ channel: "chrome" });
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
  ["1 door swing arc", doorArcs === 1],
  ["every wall labelled A-D", wallLabels.join("") === "ABCD"],
  ["square corners not labelled with 90 degrees", angleLabels === 0],
  ["PDF starts with %PDF-", text.startsWith("%PDF-")],
  ["PDF has 5 pages (plan + 4 walls)", pages === 5],
  ["PDF larger than 5kB", pdf.length > 5000],
  ["wall A panel lists its 2 windows", openingRows.length === 2 && openingRows.every((t) => t.includes("Window"))],
  ["zoom, fit and pan controls present", zoomIn === 1 && fitBtn === 1 && panTool === 1],
  // Centrelines are 520 x 340 with 12cm walls, so inside faces read 508 x 328.
  ["wall lengths read from inside faces", dimLabels.includes("508 cm") && dimLabels.includes("328 cm")],
  ["dimensions read in centimetres", !dimLabels.some((t) => t.includes(" m"))],
  ["chain sums to the inside length", chainSum === 508],
  ["setting-out chain marks each opening", chainSegs === 4],
  ["no page or console errors", problems.length === 0],
];

await writeFile(join(OUT, "report.txt"), checks.map(([n, ok]) => `${ok ? "PASS" : "FAIL"} ${n}`).join("\n"));
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (problems.length) console.log("\nProblems:\n" + problems.join("\n"));
console.log(`\npdf: ${pdfPath} (${pdf.length} bytes, ${pages} pages)`);
console.log(`screenshot: ${join(OUT, "app.png")}`);

await browser.close();
server.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
