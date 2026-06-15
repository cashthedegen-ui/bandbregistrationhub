import jsPDF from "jspdf";
import type { StudentRow } from "./types";

export function downloadDriverSheet(routeName: string, students: StudentRow[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(routeName || "Route", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
  doc.text(`Total students: ${students.length}`, pageW - margin, y, { align: "right" });
  y += 18;
  doc.setDrawColor(0);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  const byStop = new Map<string, StudentRow[]>();
  for (const s of students) {
    const k = s.stopAddress || "—";
    if (!byStop.has(k)) byStop.set(k, []);
    byStop.get(k)!.push(s);
  }

  const stops = Array.from(byStop.entries());
  for (const [addr, kids] of stops) {
    if (y > pageH - margin - 60) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const stopLines = doc.splitTextToSize(`Stop: ${addr}  (${kids.length})`, pageW - margin * 2);
    doc.text(stopLines, margin, y);
    y += 14 * stopLines.length + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const k of kids) {
      if (y > pageH - margin - 20) { doc.addPage(); y = margin; }
      doc.text(`• ${k.studentName}`, margin + 12, y);
      doc.text(`Grade ${k.grade || "—"}`, pageW - margin, y, { align: "right" });
      y += 14;
    }
    y += 10;
  }

  const safe = (routeName || "Route").replace(/[^\w-]+/g, "_");
  doc.save(`DriverSheet_${safe}.pdf`);
}
