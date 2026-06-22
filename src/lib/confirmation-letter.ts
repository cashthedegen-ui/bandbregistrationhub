import jsPDF from "jspdf";
import type { ReceiptSettings, StudentRow } from "./types";

export function confirmationNumber(row: StudentRow): string {
  // Stable 4-digit suffix from student id
  let hash = 0;
  for (let i = 0; i < row.id.length; i++) hash = (hash * 31 + row.id.charCodeAt(i)) | 0;
  const n = Math.abs(hash) % 10000;
  return `BB-26-${n.toString().padStart(4, "0")}`;
}

export function buildConfirmationLetter(row: StudentRow, settings: ReceiptSettings): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;

  // White background (default)
  doc.setTextColor(20, 20, 20);

  // ===== Header =====
  let y = 56;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("B and B Transportation", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text("Student transportation since 1989", M, y + 16);

  doc.setTextColor(110, 110, 110);
  doc.setFontSize(9);
  doc.text("Confirmation #", W - M, y - 2, { align: "right" });
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(confirmationNumber(row), W - M, y + 16, { align: "right" });

  y += 40;
  doc.setDrawColor(230, 230, 230);
  doc.line(M, y, W - M, y);

  // ===== Title =====
  y += 36;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Bus registration confirmed", M, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110, 110, 110);
  doc.text(`${settings.schoolYear} school year`, M, y);

  // ===== Two-column cards =====
  y += 24;
  const cardH = 88;
  const gap = 12;
  const cardW = (W - M * 2 - gap) / 2;

  const drawCard = (x: number, label: string, primary: string, secondary: string, accent?: string) => {
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(x, y, cardW, cardH, 8, 8, "FD");
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x + 14, y + 20);
    if (accent === "green") doc.setTextColor(22, 163, 74);
    else doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(primary, x + 14, y + 44, { maxWidth: cardW - 28 });
    doc.setTextColor(110, 110, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(secondary, x + 14, y + 64, { maxWidth: cardW - 28 });
  };

  drawCard(
    M,
    "Student",
    row.studentName || "—",
    `${row.grade ? `Grade ${row.grade}` : ""}${row.grade && row.schoolName ? " · " : ""}${row.schoolName || ""}`,
  );
  drawCard(M + cardW + gap, "Status", "Confirmed", "Payment received in full", "green");

  y += cardH + 28;

  // ===== Section helper =====
  const section = (title: string) => {
    doc.setDrawColor(235, 235, 235);
    doc.line(M, y, W - M, y);
    y += 18;
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), M, y);
    y += 14;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  };

  const row2 = (left: [string, string], right: [string, string]) => {
    const colW = (W - M * 2) / 2;
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(9);
    doc.text(left[0], M, y);
    doc.text(right[0], M + colW, y);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.text(left[1] || "—", M, y + 14, { maxWidth: colW - 10 });
    doc.text(right[1] || "—", M + colW, y + 14, { maxWidth: colW - 10 });
    y += 32;
  };

  // ===== Pickup & drop-off =====
  section("Pickup & drop-off");
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(9);
  doc.text("📍 Bus stop", M, y);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  doc.text(row.stopAddress || "—", M, y + 14, { maxWidth: W - M * 2 });
  y += 32;
  row2(["🕒 Morning pickup", "TBD — see driver schedule"], ["🕒 Afternoon dismissal", "TBD — see driver schedule"]);

  // ===== Payment =====
  section("Payment");
  const amt = (() => {
    if (row.paymentType === "Financial Aid") return (row.familyPaid ?? 0) + (row.schoolPaidAmount ?? 0);
    return row.amountPaid ?? 0;
  })();
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(9);
  doc.text("Amount paid", M, y);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`$${amt.toFixed(2)}`, M, y + 18);
  doc.setFont("helvetica", "normal");
  y += 36;

  // ===== Parent =====
  section("Parent / guardian");
  row2(["Name", row.parentName], ["Phone", row.parentPhone]);

  // ===== Notice box =====
  y += 6;
  const noticeH = 64;
  doc.setFillColor(245, 245, 247);
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(M, y, W - M * 2, noticeH, 8, 8, "FD");
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    "Please arrive at the bus stop 5 minutes before pickup. Bus assignments are final for the school year and seats cannot be transferred. Questions can be directed to our office below.",
    M + 14,
    y + 20,
    { maxWidth: W - M * 2 - 28, lineHeightFactor: 1.4 },
  );
  y += noticeH + 24;

  // ===== Footer =====
  const fy = H - 60;
  doc.setDrawColor(230, 230, 230);
  doc.line(M, fy - 16, W - M, fy - 16);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("B and B Transportation", M, fy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(9);
  doc.text("203-393-9750 — David@BandBTrans.com", M, fy + 14);
  doc.text(`Issued ${new Date().toLocaleDateString()}`, W - M, fy + 14, { align: "right" });

  return doc;
}

export function downloadConfirmationLetter(row: StudentRow, settings: ReceiptSettings) {
  const doc = buildConfirmationLetter(row, settings);
  doc.save(`Confirmation_${row.studentName.replace(/\s+/g, "_")}.pdf`);
}

export function emailConfirmationLetter(row: StudentRow, settings: ReceiptSettings) {
  // Trigger download so the parent's PDF is ready to attach
  downloadConfirmationLetter(row, settings);
  const subject = encodeURIComponent(`Bus Registration Confirmed — ${row.studentName} (${confirmationNumber(row)})`);
  const body = encodeURIComponent(
    `Hello ${row.parentName || ""},\n\n` +
      `This confirms ${row.studentName}'s bus registration for the ${settings.schoolYear} school year.\n\n` +
      `Confirmation #: ${confirmationNumber(row)}\n` +
      `School: ${row.schoolName}\n` +
      `Grade: ${row.grade}\n` +
      `Bus stop: ${row.stopAddress}\n\n` +
      `Your confirmation letter PDF has been downloaded — please attach it to this email before sending.\n\n` +
      `Questions? 203-393-9750 — David@BandBTrans.com\n\n` +
      `— B and B Transportation`,
  );
  const to = encodeURIComponent(row.parentEmail || "");
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}
