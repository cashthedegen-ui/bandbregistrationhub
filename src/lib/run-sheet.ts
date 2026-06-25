import jsPDF from "jspdf";
import type { StudentRow } from "./types";

export type Session = "Morning" | "Afternoon" | "Both";

export interface RunSheetOptions {
  schoolName: string;
  date: string;             // ISO yyyy-mm-dd
  routeName: string;        // stop address / route label
  session: Session;
  driverName: string;
  busNumber: string;
  morningPickupTime?: string;
  afternoonDropoffTime?: string;
  notes?: string;
  students: StudentRow[];
}

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

const formatPhone = (raw: string | undefined | null): string => {
  if (!raw) return "—";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1"))
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return String(raw);
};

export function runSheetFilename(opts: RunSheetOptions): string {
  const safe = (s: string) => (s || "").replace(/[^\w-]+/g, "_");
  return `RunSheet_${safe(opts.schoolName)}_${safe(opts.routeName)}_${opts.date || "date"}.pdf`;
}

export function buildRunSheet(opts: RunSheetOptions): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("B & B Transportation — Daily Run Sheet", M, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text(`Session: ${opts.session}`, W - M, 28, { align: "right" });
  doc.text(formatDate(opts.date), W - M, 48, { align: "right" });

  y = 92;
  doc.setTextColor(20, 20, 20);

  // Info grid
  const drawInfo = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, yy, w, 44, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(label.toUpperCase(), x + 10, yy + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(value || "—", w - 20);
    doc.text(lines.slice(0, 2), x + 10, yy + 30);
  };

  const colW = (W - M * 2 - 16) / 3;
  drawInfo("School", opts.schoolName || "—", M, y, colW);
  drawInfo("Route / Stop", opts.routeName || "—", M + colW + 8, y, colW);
  drawInfo("Driver", opts.driverName || "—", M + (colW + 8) * 2, y, colW);
  y += 52;
  drawInfo("Bus #", opts.busNumber || "—", M, y, colW);
  drawInfo("AM Pickup", opts.morningPickupTime || (opts.session === "Afternoon" ? "—" : "TBD"), M + colW + 8, y, colW);
  drawInfo("PM Dropoff", opts.afternoonDropoffTime || (opts.session === "Morning" ? "—" : "TBD"), M + (colW + 8) * 2, y, colW);
  y += 60;

  // Students table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Riders (${opts.students.length})`, M, y);
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(M, y, W - M, y);
  y += 14;

  const headers = ["#", "Student / Grade", "Pickup / Dropoff", "Parent / Phone", "Notes"];
  const widths = [22, 130, 150, 130, W - M * 2 - 22 - 130 - 150 - 130];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  let x = M;
  headers.forEach((h, i) => { doc.text(h.toUpperCase(), x, y); x += widths[i]; });
  y += 8;
  doc.setDrawColor(230, 230, 230);
  doc.line(M, y, W - M, y);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);

  opts.students.forEach((s, idx) => {
    const rowH = 56;
    if (y + rowH > H - M - 30) {
      doc.addPage();
      y = M;
    }
    x = M;
    // # column
    doc.setFont("helvetica", "bold");
    doc.text(String(idx + 1), x, y + 4);
    x += widths[0];

    doc.setFont("helvetica", "bold");
    const nameLines = doc.splitTextToSize(s.studentName || "—", widths[1] - 6);
    doc.text(nameLines.slice(0, 2), x, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(9);
    doc.text(`Grade ${s.grade || "—"} · ${s.schoolName || ""}`.trim(), x, y + 20);
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    x += widths[1];

    const addr = (s.stopAddress || "—").trim();
    const addrLines = doc.splitTextToSize(addr, widths[2] - 6);
    doc.text(addrLines.slice(0, 2), x, y + 4);
    if (s.stopAddress2) {
      doc.setTextColor(110, 110, 110);
      doc.setFontSize(8);
      const a2 = doc.splitTextToSize(`2nd: ${s.stopAddress2}`, widths[2] - 6);
      doc.text(a2.slice(0, 1), x, y + 32);
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
    }
    x += widths[2];

    const parentLines = doc.splitTextToSize(s.parentName || "—", widths[3] - 6);
    doc.text(parentLines.slice(0, 1), x, y + 4);
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(9);
    doc.text(formatPhone(s.parentPhone), x, y + 20);
    if (s.parentEmail) {
      const em = doc.splitTextToSize(s.parentEmail, widths[3] - 6);
      doc.text(em.slice(0, 1), x, y + 34);
    }
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    x += widths[3];

    const noteText = [
      s.alertFlag ? "⚠ ALERT" : "",
      s.notes || "",
    ].filter(Boolean).join(" · ") || "—";
    const noteLines = doc.splitTextToSize(noteText, widths[4] - 6);
    doc.text(noteLines.slice(0, 3), x, y + 4);

    y += rowH;
    doc.setDrawColor(240, 240, 240);
    doc.line(M, y - 6, W - M, y - 6);
  });

  if (opts.notes && opts.notes.trim()) {
    if (y + 60 > H - M) { doc.addPage(); y = M; }
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Driver Notes / Special Instructions", M, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(opts.notes.trim(), W - M * 2);
    doc.text(lines, M, y);
    y += lines.length * 12;
  }

  // Footer signature line
  const footerY = H - M;
  doc.setDrawColor(180, 180, 180);
  doc.line(M, footerY - 14, M + 200, footerY - 14);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("Driver signature", M, footerY - 2);
  doc.line(W - M - 200, footerY - 14, W - M, footerY - 14);
  doc.text("Date / time completed", W - M - 200, footerY - 2);

  return doc;
}

export function downloadRunSheet(opts: RunSheetOptions) {
  const doc = buildRunSheet(opts);
  doc.save(runSheetFilename(opts));
}

export function runSheetDataUri(opts: RunSheetOptions): string {
  return buildRunSheet(opts).output("datauristring");
}

export function runSheetBase64(opts: RunSheetOptions): string {
  // jsPDF's datauristring includes prefix; strip it.
  const uri = buildRunSheet(opts).output("datauristring");
  const i = uri.indexOf("base64,");
  return i >= 0 ? uri.slice(i + 7) : uri;
}
