import jsPDF from "jspdf";
import type { ReceiptSettings, StudentRow } from "./types";

export function buildReceipt(row: StudentRow, settings: ReceiptSettings, receiptNo: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  let y = 56;

  // Header bar
  doc.setFillColor(15, 17, 23);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(240, 193, 75);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(settings.companyName.toUpperCase(), 40, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  doc.text("Student Registration Receipt", 40, 70);
  doc.setFontSize(9);
  doc.text(`Receipt #: ${receiptNo}`, W - 40, 50, { align: "right" });
  doc.text(new Date().toLocaleDateString(), W - 40, 65, { align: "right" });

  y = 130;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`School Year ${settings.schoolYear}`, 40, y);
  y += 24;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(title.toUpperCase(), 40, y);
    y += 6;
    doc.setDrawColor(220, 220, 220);
    doc.line(40, y, W - 40, y);
    y += 16;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  };
  const kv = (k: string, v: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, 50, y);
    doc.setFont("helvetica", "normal");
    doc.text(v || "—", 200, y);
    y += 18;
  };

  section("Student");
  kv("Name", row.studentName);
  kv("Grade", row.grade);
  kv("School", row.schoolName);

  y += 6;
  section("Parent / Guardian");
  kv("Name", row.parentName);
  kv("Address", row.parentAddress);
  kv("Phone", row.parentPhone);
  kv("Email", row.parentEmail);

  y += 6;
  section("Bus Stop");
  kv("Location", row.stopAddress);

  y += 6;
  section("Enrollment");
  kv("Status", row.status);

  if (row.alertFlag) {
    y += 6;
    doc.setFillColor(240, 193, 75);
    doc.rect(40, y, W - 80, 50, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.text("⚠ ALERT", 50, y + 20);
    doc.setFont("helvetica", "normal");
    doc.text(row.notes || "Special handling required.", 50, y + 38, { maxWidth: W - 100 });
    y += 60;
  }

  // Footer
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text(settings.footer, W / 2, doc.internal.pageSize.getHeight() - 50, { align: "center" });
  doc.text(
    `${settings.companyName} • ${settings.companyAddress} • ${settings.companyPhone} • ${settings.companyEmail}`,
    W / 2,
    doc.internal.pageSize.getHeight() - 36,
    { align: "center" },
  );
  return doc;
}

export function downloadReceipt(row: StudentRow, settings: ReceiptSettings) {
  const no = `BBT-${row.id.slice(0, 8).toUpperCase()}`;
  const doc = buildReceipt(row, settings, no);
  doc.save(`Receipt_${row.studentName.replace(/\s+/g, "_")}.pdf`);
}
export function downloadAllReceipts(rows: StudentRow[], settings: ReceiptSettings) {
  for (const r of rows) downloadReceipt(r, settings);
}
