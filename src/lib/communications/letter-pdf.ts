import jsPDF from "jspdf";
import type { LetterVariables } from "./letter-renderer";
import { interpolateLetterBody, BB_LOGO_URL } from "./letter-renderer";

// ============================================================================
// Shared PDF renderer for the St. Luke's Parking Shuttle confirmation letter.
// Works both client-side (loads the logo via HTMLImageElement) and server-side
// (accepts logo bytes and parses PNG dimensions directly).
// ============================================================================

// Strip HTML tags to plain paragraphs preserving <strong> as bold segments.
interface Run { text: string; bold: boolean }
type Paragraph = Run[];

function htmlToParagraphs(html: string): Paragraph[] {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n");
  const chunks = cleaned.split(/<\/p\s*>/i);
  const paras: Paragraph[] = [];
  for (const chunk of chunks) {
    const opened = chunk.replace(/<p[^>]*>/i, "");
    if (!opened.trim()) continue;
    const runs: Run[] = [];
    const re = /<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(opened)) !== null) {
      if (m.index > last) runs.push({ text: stripTags(opened.slice(last, m.index)), bold: false });
      runs.push({ text: stripTags(m[2]), bold: true });
      last = m.index + m[0].length;
    }
    if (last < opened.length) runs.push({ text: stripTags(opened.slice(last)), bold: false });
    if (runs.some((r) => r.text.trim())) paras.push(runs);
  }
  return paras;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

interface LogoInput {
  // Either an HTMLImageElement (browser) or a base64 data URL string (server).
  image: HTMLImageElement | string;
  aspect: number; // height / width
}

function renderPdfDoc(bodyHtml: string, vars: LetterVariables, logo: LogoInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 60;

  const gray = { r: 75, g: 85, b: 99 };
  const light = { r: 156, g: 163, b: 175 };

  // ===== Logo (top-left) =====
  const logoLeft = 36;
  const logoTop = 28;
  const logoMaxW = 220;
  const logoW = logoMaxW;
  const logoH = logoMaxW * logo.aspect;
  doc.addImage(logo.image as any, "PNG", logoLeft, logoTop, logoW, logoH, "bb-logo", "NONE");

  // ===== School year =====
  const centerX = W / 2;
  let y = logoTop + logoH + 40;
  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(28);
  doc.text(vars.school_year, centerX, y, { align: "center" });

  // Title
  y += 36;
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.text("St Luke\u2019s School Parking Shuttle", centerX, y, { align: "center" });

  // ===== Body paragraphs =====
  y += 44;
  const paragraphs = htmlToParagraphs(bodyHtml);
  const bodyMaxW = W - M * 2;
  doc.setTextColor(gray.r, gray.g, gray.b);

  for (const para of paragraphs) {
    const flat = para.map((r) => r.text).join("");
    const isField = /^(Date|Amount Paid|Purchaser)\s*:/.test(flat.trim());

    if (isField) {
      doc.setFontSize(13);
      const idx = flat.indexOf(":");
      const label = flat.slice(0, idx + 1);
      const value = flat.slice(idx + 1).trim();
      doc.setFont("helvetica", "bold");
      doc.text(label, M, y);
      const labelW = doc.getTextWidth(label + " ");
      doc.setFont("helvetica", "normal");
      doc.text(value, M + labelW, y);
      y += 22;
      continue;
    }

    doc.setFontSize(12.5);
    y = flowRuns(doc, para, M, y, bodyMaxW, 17);
    y += 8;
  }

  // ===== Footer =====
  const fy = H - 44;
  doc.setDrawColor(light.r, light.g, light.b);
  doc.setLineWidth(0.5);
  doc.line(M, fy - 14, W - M, fy - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.text("41 VILLAGE LN BETHANY, CT", M, fy);
  doc.text("PH: 203-393-9750", M + 180, fy);
  doc.text("FX: 203-393-7360", M + 300, fy);
  doc.text("WWW.BANDBTRANS.COM", W - M, fy, { align: "right" });

  return doc;
}

function flowRuns(doc: jsPDF, runs: Run[], x0: number, y0: number, maxW: number, lineH: number): number {
  const spaceW = (bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    return doc.getTextWidth(" ");
  };
  let x = x0;
  let y = y0;
  for (const run of runs) {
    if (!run.text) continue;
    doc.setFont("helvetica", run.bold ? "bold" : "normal");
    const words = run.text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wW = doc.getTextWidth(w);
      const gap = x === x0 ? 0 : spaceW(run.bold);
      if (x + gap + wW > x0 + maxW) {
        y += lineH;
        x = x0;
        doc.setFont("helvetica", run.bold ? "bold" : "normal");
        doc.text(w, x, y);
        x += wW;
      } else {
        if (gap > 0) x += gap;
        doc.text(w, x, y);
        x += wW;
      }
    }
  }
  return y + lineH;
}

// ============================================================================
// Browser entry — loads the CDN logo via HTMLImageElement.
// ============================================================================

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

export async function buildLetterPdf(templateBodyHtml: string, vars: LetterVariables): Promise<jsPDF> {
  const { html } = interpolateLetterBody(templateBodyHtml, vars);
  const img = await loadLogoImage();
  const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0.5;
  return renderPdfDoc(html, vars, { image: img, aspect });
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

// ============================================================================
// Server entry — accepts raw PNG bytes (from a fetch on the server) and
// produces a PDF as a Uint8Array, suitable for attaching to an email.
// ============================================================================

// Parse a PNG's width/height from its IHDR chunk (bytes 16..24).
function parsePngDims(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error("Invalid PNG (too short)");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16, false);
  const height = dv.getUint32(20, false);
  return { width, height };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Cross-runtime base64 (Node/Worker/Browser).
  // Buffer exists in Node/Worker with nodejs_compat.
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(bin);
}

export function buildLetterPdfFromBytes(
  templateBodyHtml: string,
  vars: LetterVariables,
  logoPngBytes: Uint8Array,
): { pdfBytes: Uint8Array; base64: string } {
  const { html } = interpolateLetterBody(templateBodyHtml, vars);
  const { width, height } = parsePngDims(logoPngBytes);
  const aspect = width > 0 ? height / width : 0.5;
  const dataUrl = `data:image/png;base64,${bytesToBase64(logoPngBytes)}`;
  const doc = renderPdfDoc(html, vars, { image: dataUrl, aspect });
  const ab = doc.output("arraybuffer") as ArrayBuffer;
  const pdfBytes = new Uint8Array(ab);
  return { pdfBytes, base64: bytesToBase64(pdfBytes) };
}
