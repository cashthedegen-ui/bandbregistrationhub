import { jsPDF } from "jspdf";
import type { LetterVariables } from "./letter-renderer";
import { BB_LOGO_URL } from "./letter-renderer";

// ============================================================================
// St. Luke's Parking Shuttle payment confirmation PDF.
// Fixed one-page US Letter layout. All body copy is generated from
// `LetterVariables` — the stored `templateBodyHtml` is intentionally NOT used
// so every family receives the same reviewed wording.
// ============================================================================

// ---- Page + layout constants (all in points; 72pt = 1 inch) ----
const PAGE_W = 612;   // 8.5"
const PAGE_H = 792;   // 11"
const M_LEFT = 54;    // 0.75"
const M_RIGHT = 54;
const M_TOP = 54;
const M_BOTTOM = 54;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;

const COLOR_TEXT = { r: 31, g: 41, b: 55 };      // slate-800
const COLOR_MUTED = { r: 75, g: 85, b: 99 };     // slate-600
const COLOR_SUBTLE = { r: 107, g: 114, b: 128 }; // slate-500
const COLOR_DIVIDER = { r: 209, g: 213, b: 219 };// slate-300

interface LogoInput {
  image: HTMLImageElement | string; // HTMLImage in browser, data URL string on server
  aspect: number;                    // height / width
}

interface Run {
  text: string;
  bold?: boolean;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function setFont(doc: jsPDF, bold: boolean, size: number) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
}

// Flow inline runs (mixing bold + normal) with word wrapping. Returns the
// baseline y of the next line to draw.
function drawRuns(
  doc: jsPDF,
  runs: Run[],
  x0: number,
  y0: number,
  maxW: number,
  size: number,
  lineH: number,
): number {
  let x = x0;
  let y = y0;
  let atLineStart = true;

  for (const run of runs) {
    if (!run.text) continue;
    const bold = !!run.bold;
    setFont(doc, bold, size);
    // Split on whitespace but keep the spaces as their own tokens so we can
    // decide when to wrap between words.
    const tokens = run.text.split(/(\s+)/);
    for (const tok of tokens) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) {
        if (atLineStart) continue; // eat leading spaces on a new line
        const spaceW = doc.getTextWidth(" ");
        if (x + spaceW > x0 + maxW) {
          // wrap
          y += lineH;
          x = x0;
          atLineStart = true;
        } else {
          x += spaceW;
        }
        continue;
      }
      const w = doc.getTextWidth(tok);
      if (!atLineStart && x + w > x0 + maxW) {
        y += lineH;
        x = x0;
        atLineStart = true;
      }
      // If a single token is wider than the line, draw it anyway.
      doc.text(tok, x, y);
      x += w;
      atLineStart = false;
    }
  }
  return y + lineH;
}

function drawParagraph(
  doc: jsPDF,
  runs: Run[],
  y: number,
  size = 11.5,
  lineH = 15.5,
): number {
  doc.setTextColor(COLOR_TEXT.r, COLOR_TEXT.g, COLOR_TEXT.b);
  return drawRuns(doc, runs, M_LEFT, y, CONTENT_W, size, lineH);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function renderPdfDoc(vars: LetterVariables, logo: LogoInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // ============ Header: logo ============
  const logoW = 170;
  const logoH = Math.max(40, logoW * (logo.aspect || 0.5));
  const logoY = M_TOP;
  doc.addImage(logo.image as any, "PNG", M_LEFT, logoY, logoW, logoH, "bb-logo", "FAST");

  // ============ Title block (centered) ============
  const centerX = PAGE_W / 2;
  let y = logoY + logoH + 34;

  setFont(doc, false, 24);
  doc.setTextColor(COLOR_SUBTLE.r, COLOR_SUBTLE.g, COLOR_SUBTLE.b);
  doc.text(vars.school_year, centerX, y, { align: "center" });

  y += 24;
  setFont(doc, false, 16);
  doc.setTextColor(COLOR_MUTED.r, COLOR_MUTED.g, COLOR_MUTED.b);
  doc.text("St. Luke\u2019s School Parking Shuttle", centerX, y, { align: "center" });

  y += 22;
  setFont(doc, true, 15);
  doc.setTextColor(COLOR_TEXT.r, COLOR_TEXT.g, COLOR_TEXT.b);
  doc.text("Payment Confirmation", centerX, y, { align: "center" });

  // ============ Body copy ============
  y += 32;
  y = drawParagraph(doc, [
    { text: "This letter confirms that " },
    { text: vars.student_name, bold: true },
    { text: ` has purchased shuttle transportation from ${vars.shuttle_location} for the ${vars.school_year} school year.` },
  ], y);

  y += 8;
  y = drawParagraph(doc, [
    { text: "This service is paid in full for the school year and entitles " },
    { text: vars.student_name, bold: true },
    { text: " and siblings to use the shuttle service to and from St. Luke\u2019s School." },
  ], y);

  // ============ Payment details (aligned two-column table) ============
  y += 18;
  const rowH = 20;
  const labelX = M_LEFT;
  const valueX = M_LEFT + 120;

  const rows: Array<[string, string]> = [
    ["Date:", vars.payment_date],
    ["Amount Paid:", vars.amount_paid],
    ["Purchaser:", vars.parent_name],
  ];

  doc.setTextColor(COLOR_TEXT.r, COLOR_TEXT.g, COLOR_TEXT.b);
  for (const [label, value] of rows) {
    setFont(doc, true, 12);
    doc.text(label, labelX, y);
    setFont(doc, false, 12);
    // Truncate absurdly long values to the content width to avoid clipping.
    const maxW = PAGE_W - M_RIGHT - valueX;
    const lines = doc.splitTextToSize(value, maxW);
    doc.text(lines[0] ?? "", valueX, y);
    y += rowH;
  }

  // ============ Footer ============
  const footerBaselineBottom = PAGE_H - M_BOTTOM;
  const footerLineH = 12;
  const footerLines: Array<{ text: string; bold?: boolean }> = [
    { text: "B&B Transportation, Inc.", bold: true },
    { text: "41 Village Ln, Bethany, CT" },
    { text: "Phone: 203-393-9750    Fax: 203-393-7360" },
    { text: "www.bandbtrans.com" },
  ];
  const footerBlockH = footerLines.length * footerLineH;
  const footerTopBaseline = footerBaselineBottom - footerBlockH + footerLineH;

  // Divider
  const dividerY = footerTopBaseline - 16;
  doc.setDrawColor(COLOR_DIVIDER.r, COLOR_DIVIDER.g, COLOR_DIVIDER.b);
  doc.setLineWidth(0.5);
  doc.line(M_LEFT, dividerY, PAGE_W - M_RIGHT, dividerY);

  doc.setTextColor(COLOR_MUTED.r, COLOR_MUTED.g, COLOR_MUTED.b);
  let fy = footerTopBaseline;
  for (const line of footerLines) {
    setFont(doc, !!line.bold, 9);
    doc.text(line.text, centerX, fy, { align: "center" });
    fy += footerLineH;
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Browser entry (used for preview + download in the app)
// ---------------------------------------------------------------------------

let logoImagePromise: Promise<HTMLImageElement> | null = null;
function loadLogoImage(): Promise<HTMLImageElement> {
  if (logoImagePromise) return logoImagePromise;
  logoImagePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      logoImagePromise = null;
      reject(e);
    };
    img.src = BB_LOGO_URL;
  });
  return logoImagePromise;
}

// Kept for backwards compat with existing callers. The `templateBodyHtml`
// argument is intentionally ignored — the letter uses a fixed layout driven
// by `vars` so the family-facing document is always identical.
export async function buildLetterPdf(_templateBodyHtml: string, vars: LetterVariables): Promise<jsPDF> {
  const img = await loadLogoImage();
  const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0.5;
  return renderPdfDoc(vars, { image: img, aspect });
}

export async function downloadLetterPdf(templateBodyHtml: string, vars: LetterVariables, filenameHint?: string) {
  const doc = await buildLetterPdf(templateBodyHtml, vars);
  const safe = (filenameHint || vars.student_name || "confirmation").replace(/[^a-z0-9]+/gi, "_");
  doc.save(`StLukes_Confirmation_${safe}.pdf`);
}

export async function openLetterPdfInNewTab(templateBodyHtml: string, vars: LetterVariables) {
  const doc = await buildLetterPdf(templateBodyHtml, vars);
  const url = doc.output("bloburl");
  window.open(url, "_blank", "noopener");
}

// ---------------------------------------------------------------------------
// Server entry — accepts raw PNG bytes for the logo (from a server-side fetch)
// and produces the PDF bytes + base64 ready for email attachment.
// ---------------------------------------------------------------------------

function parsePngDims(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error("Invalid PNG (too short)");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(bin);
}

export function buildLetterPdfFromBytes(
  _templateBodyHtml: string,
  vars: LetterVariables,
  logoPngBytes: Uint8Array,
): { pdfBytes: Uint8Array; base64: string } {
  const { width, height } = parsePngDims(logoPngBytes);
  const aspect = width > 0 ? height / width : 0.5;
  const dataUrl = `data:image/png;base64,${bytesToBase64(logoPngBytes)}`;
  const doc = renderPdfDoc(vars, { image: dataUrl, aspect });
  const ab = doc.output("arraybuffer") as ArrayBuffer;
  const pdfBytes = new Uint8Array(ab);
  return { pdfBytes, base64: bytesToBase64(pdfBytes) };
}
