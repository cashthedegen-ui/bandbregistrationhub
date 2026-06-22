import jsPDF from "jspdf";
import type { ReceiptSettings, StudentRow } from "./types";

export function confirmationNumber(row: StudentRow): string {
  // Stable 4-digit suffix from student id
  let hash = 0;
  for (let i = 0; i < row.id.length; i++) hash = (hash * 31 + row.id.charCodeAt(i)) | 0;
  const n = Math.abs(hash) % 10000;
  return `BB-26-${n.toString().padStart(4, "0")}`;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pickupTime = (row: StudentRow, key: "morningPickup" | "afternoonDismissal"): string => {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return "TBD — see driver schedule";
};

const formatPhone = (raw: string | undefined | null): string => {
  if (!raw) return "—";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1"))
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return String(raw);
};

export function buildConfirmationLetter(row: StudentRow, settings: ReceiptSettings): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 64;

  doc.setTextColor(20, 20, 20);

  // ===== Header =====
  let y = 64;
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

  y += 44;
  doc.setDrawColor(230, 230, 230);
  doc.line(M, y, W - M, y);

  // ===== Title =====
  y += 40;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Bus registration confirmed", M, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110, 110, 110);
  doc.text(`${settings.schoolYear} school year`, M, y);

  // ===== Two-column cards =====
  y += 28;
  const cardH = 92;
  const gap = 14;
  const cardW = (W - M * 2 - gap) / 2;

  const drawCard = (x: number, label: string, primary: string, secondary: string, accent?: string) => {
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(x, y, cardW, cardH, 8, 8, "FD");
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x + 16, y + 22);
    if (accent === "green") doc.setTextColor(22, 163, 74);
    else doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(primary, x + 16, y + 48, { maxWidth: cardW - 32 });
    doc.setTextColor(110, 110, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(secondary, x + 16, y + 70, { maxWidth: cardW - 32 });
  };

  drawCard(
    M,
    "Student",
    row.studentName || "—",
    `${row.grade ? `Grade ${row.grade}` : ""}${row.grade && row.schoolName ? " · " : ""}${row.schoolName || ""}`,
  );
  drawCard(M + cardW + gap, "Status", "Confirmed", "Payment received in full", "green");

  y += cardH + 36;

  // ===== Section helper =====
  const section = (title: string) => {
    doc.setDrawColor(235, 235, 235);
    doc.line(M, y, W - M, y);
    y += 22;
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), M, y);
    y += 18;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  };

  const labeled = (label: string, value: string, x: number, maxW: number) => {
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(value || "—", x, y + 16, { maxWidth: maxW });
  };

  const row2 = (left: [string, string], right: [string, string]) => {
    const colW = (W - M * 2) / 2;
    labeled(left[0], left[1], M, colW - 12);
    labeled(right[0], right[1], M + colW, colW - 12);
    y += 36;
  };

  // ===== Pickup & drop-off =====
  section("Pickup & drop-off");
  labeled("Bus stop", row.stopAddress || "—", M, W - M * 2);
  y += 36;
  row2(
    ["Morning pickup", pickupTime(row, "morningPickup")],
    ["Afternoon dismissal", pickupTime(row, "afternoonDismissal")],
  );

  // ===== Payment =====
  section("Payment");
  const amt = (() => {
    if (row.paymentType === "Financial Aid") return (row.familyPaid ?? 0) + (row.schoolPaidAmount ?? 0);
    return row.amountPaid ?? 0;
  })();
  doc.setTextColor(130, 130, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AMOUNT PAID", M, y);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(money(amt), M, y + 22);
  doc.setFont("helvetica", "normal");
  y += 44;

  // ===== Parent =====
  section("Parent / guardian");
  row2(["Name", row.parentName], ["Phone", formatPhone(row.parentPhone)]);

  // ===== Notice box =====
  y += 10;
  const noticeH = 76;
  doc.setFillColor(245, 245, 247);
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(M, y, W - M * 2, noticeH, 8, 8, "FD");
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    "Please arrive at the bus stop 5 minutes before pickup. Bus assignments are final for the school year and seats cannot be transferred. Questions can be directed to our office below.",
    M + 16,
    y + 24,
    { maxWidth: W - M * 2 - 32, lineHeightFactor: 1.5 },
  );
  y += noticeH + 28;

  // ===== Footer =====
  const fy = H - 64;
  doc.setDrawColor(230, 230, 230);
  doc.line(M, fy - 22, W - M, fy - 22);

  // Left: brand + contact (two lines)
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("B and B Transportation", M, fy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(9);
  doc.text("(203) 393-9750  ·  David@BandBTrans.com", M, fy + 14);

  // Right: issued date, clearly right-aligned on its own line
  doc.setTextColor(130, 130, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ISSUED", W - M, fy, { align: "right" });
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString(), W - M, fy + 14, { align: "right" });


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
