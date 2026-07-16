import jsPDF from "jspdf";
import type { LetterVariables } from "./letter-renderer";
import { interpolateLetterBody, BB_LOGO_URL } from "./letter-renderer";

// Cache the loaded logo image so repeated PDF generations don't re-fetch.
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

// Strip HTML tags to plain paragraphs preserving <strong> as bold segments.
// Returns an array of paragraphs; each paragraph is a list of {text, bold} runs.
interface Run { text: string; bold: boolean }
type Paragraph = Run[];

function htmlToParagraphs(html: string): Paragraph[] {
  // Normalise
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n");
  // Split on </p> boundaries
  const chunks = cleaned.split(/<\/p\s*>/i);
  const paras: Paragraph[] = [];
  for (const chunk of chunks) {
    const opened = chunk.replace(/<p[^>]*>/i, "");
    if (!opened.trim()) continue;
    const runs: Run[] = [];
    // Tokenize <strong>/<b>
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

export async function buildLetterPdf(templateBodyHtml: string, vars: LetterVariables): Promise<jsPDF> {
  const { html } = interpolateLetterBody(templateBodyHtml, vars);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 60;

  const gray = { r: 75, g: 85, b: 99 };
  const light = { r: 156, g: 163, b: 175 };

  // ===== Logo (top-left, matches HTML/email placement) =====
  // 36px left / 28px top padding, max width 220px, height auto (aspect preserved).
  const logo = await loadLogoImage();
  const logoLeft = 36;
  const logoTop = 28;
  const logoMaxW = 220;
  const aspect = logo.naturalWidth > 0 ? logo.naturalHeight / logo.naturalWidth : 0.5;
  const logoW = logoMaxW;
  const logoH = logoMaxW * aspect;
  // Pass the HTMLImageElement so jsPDF embeds the original PNG data (no re-encoding
  // to JPEG); alias uses the CDN asset ID for cache-friendly single embed.
  doc.addImage(logo, "PNG", logoLeft, logoTop, logoW, logoH, "bb-logo", "NONE");

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
  const paragraphs = htmlToParagraphs(html);
  const bodyMaxW = W - M * 2;
  doc.setTextColor(gray.r, gray.g, gray.b);

  for (const para of paragraphs) {
    // Detect "field-style" line: single run beginning with "Date:" / "Amount Paid:" / "Purchaser:"
    // Rendered flat with a small gap.
    const flat = para.map((r) => r.text).join("");
    const isField = /^(Date|Amount Paid|Purchaser)\s*:/.test(flat.trim());

    if (isField) {
      doc.setFontSize(13);
      // Split label vs value on the first ":"
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
    // Layout runs with wrapping. Build a token list then flow it.
    y = flowRuns(doc, para, M, y, bodyMaxW, 17);
    y += 8; // paragraph gap
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

// Flow a paragraph of {text, bold} runs with word wrapping. Returns next y.
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

export function downloadLetterPdf(templateBodyHtml: string, vars: LetterVariables, filenameHint?: string) {
  const doc = buildLetterPdf(templateBodyHtml, vars);
  const safe = (filenameHint || vars.student_name || "confirmation").replace(/[^a-z0-9]+/gi, "_");
  doc.save(`StLukes_Confirmation_${safe}.pdf`);
}

export function openLetterPdfInNewTab(templateBodyHtml: string, vars: LetterVariables) {
  const doc = buildLetterPdf(templateBodyHtml, vars);
  const url = doc.output("bloburl");
  window.open(url, "_blank", "noopener");
}
