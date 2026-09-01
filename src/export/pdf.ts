import { jsPDF } from "jspdf";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement } from "react";
import { svg2pdf } from "svg2pdf.js";
import { ElevationSvg } from "../render/ElevationSvg";
import { PlanSvg } from "../render/PlanSvg";
import { DIM, INK } from "../render/theme";
import { projectUnit } from "../model/factory";
import type { Project } from "../model/types";
import { unitName } from "../model/units";
import { fitDimensions, photoTitle, projectPhotos } from "../model/photos";
import { elevationPages, elevationTitle, SKETCH_TITLE } from "./pageTitles";

// A4 landscape in points.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;
const TITLE_H = 28;
const FOOTER_H = 24;

const DRAW_W = PAGE_W - MARGIN * 2;
const DRAW_H = PAGE_H - MARGIN * 2 - TITLE_H - FOOTER_H;

/**
 * Render a React SVG component into a detached DOM node and hand back the real <svg>.
 * Screen and PDF go through the same components this way, so there is no second drawing
 * implementation that could drift out of sync with what the user approved on screen.
 */
function renderToSvg(element: React.ReactElement): { svg: SVGSVGElement; dispose: () => void } {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  document.body.appendChild(host);

  const root = createRoot(host);
  flushSync(() => root.render(element));

  const svg = host.querySelector("svg");
  if (!svg) {
    root.unmount();
    host.remove();
    throw new Error("Page rendered no SVG.");
  }
  return {
    svg: svg as SVGSVGElement,
    dispose: () => {
      root.unmount();
      host.remove();
    },
  };
}

function chrome(
  doc: jsPDF,
  project: Project,
  title: string,
  page: number,
  total: number,
  note = `Not to scale — all dimensions in ${unitName(projectUnit(project))}`,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(INK);
  doc.text(title, MARGIN, MARGIN + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(DIM);
  const date = new Date().toISOString().slice(0, 10);
  doc.text(`${project.name} · ${date}`, MARGIN, PAGE_H - MARGIN + 4);
  doc.text(note, PAGE_W / 2, PAGE_H - MARGIN + 4, { align: "center" });
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 4, {
    align: "right",
  });
}

export async function exportPdf(project: Project): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const photos = projectPhotos(project);
  const elevations = elevationPages(project);
  const total = 2 + elevations.length + photos.length;
  const top = MARGIN + TITLE_H;

  const plan = renderToSvg(
    createElement(PlanSvg, { project, width: DRAW_W, height: DRAW_H, showDims: true }),
  );
  try {
    chrome(doc, project, "Floor Plan", 1, total);
    await svg2pdf(plan.svg, doc, { x: MARGIN, y: top, width: DRAW_W, height: DRAW_H });
  } finally {
    plan.dispose();
  }

  // A clean outline to draw on by hand: walls and openings, nothing else. Dimensions,
  // room tints and wall letters are all deliberately absent, so whatever gets sketched
  // over the top stays readable.
  doc.addPage([PAGE_W, PAGE_H], "landscape");
  const sketch = renderToSvg(
    createElement(PlanSvg, {
      project,
      width: DRAW_W,
      height: DRAW_H,
      showDims: false,
      showRooms: false,
      showLabels: false,
    }),
  );
  try {
    chrome(doc, project, SKETCH_TITLE, 2, total, "Blank plan for sketching by hand");
    await svg2pdf(sketch.svg, doc, { x: MARGIN, y: top, width: DRAW_W, height: DRAW_H });
  } finally {
    sketch.dispose();
  }

  for (let i = 0; i < elevations.length; i += 1) {
    const { wallId, side } = elevations[i];
    doc.addPage([PAGE_W, PAGE_H], "landscape");
    const page = renderToSvg(
      createElement(ElevationSvg, {
        project,
        wallId,
        side,
        width: DRAW_W,
        height: DRAW_H,
      }),
    );
    try {
      chrome(doc, project, elevationTitle(project, wallId, side), i + 3, total);
      await svg2pdf(page.svg, doc, { x: MARGIN, y: top, width: DRAW_W, height: DRAW_H });
    } finally {
      page.dispose();
    }
  }

  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    doc.addPage([PAGE_W, PAGE_H], "landscape");
    chrome(
      doc,
      project,
      photoTitle(photo, i),
      2 + elevations.length + i + 1,
      total,
      photo.name,
    );
    const box = fitDimensions(photo.width, photo.height, DRAW_W, DRAW_H);
    try {
      doc.addImage(
        photo.dataUrl,
        // Centred, so a portrait photo does not sit awkwardly against one margin.
        MARGIN + (DRAW_W - box.width) / 2,
        top + (DRAW_H - box.height) / 2,
        box.width,
        box.height,
      );
    } catch {
      doc.setFontSize(10);
      doc.text("This photo could not be drawn.", MARGIN, top + 20);
    }
  }

  return doc.output("blob");
}

export function pdfFileName(project: Project): string {
  const safe = project.name.replace(/[^\w\- ]+/g, "").trim() || "floorplan";
  return `${safe}.pdf`;
}
