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
import { elevationTitle } from "./pageTitles";

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

function chrome(doc: jsPDF, project: Project, title: string, page: number, total: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(INK);
  doc.text(title, MARGIN, MARGIN + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(DIM);
  const date = new Date().toISOString().slice(0, 10);
  doc.text(`${project.name} · ${date}`, MARGIN, PAGE_H - MARGIN + 4);
  doc.text(
    `Not to scale — all dimensions in ${unitName(projectUnit(project))}`,
    PAGE_W / 2,
    PAGE_H - MARGIN + 4,
    { align: "center" },
  );
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 4, {
    align: "right",
  });
}

export async function exportPdf(project: Project): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const total = 1 + project.walls.length;
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

  for (let i = 0; i < project.walls.length; i += 1) {
    const wall = project.walls[i];
    doc.addPage([PAGE_W, PAGE_H], "landscape");
    const page = renderToSvg(
      createElement(ElevationSvg, {
        project,
        wallId: wall.id,
        width: DRAW_W,
        height: DRAW_H,
      }),
    );
    try {
      chrome(doc, project, elevationTitle(project, wall.id), i + 2, total);
      await svg2pdf(page.svg, doc, { x: MARGIN, y: top, width: DRAW_W, height: DRAW_H });
    } finally {
      page.dispose();
    }
  }

  return doc.output("blob");
}

export function pdfFileName(project: Project): string {
  const safe = project.name.replace(/[^\w\- ]+/g, "").trim() || "floorplan";
  return `${safe}.pdf`;
}
