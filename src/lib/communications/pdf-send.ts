// Shared helpers for building the St. Luke's confirmation PDF on the server
// and sending it as a Resend email attachment. Used by both the production
// Send Confirmation path and the admin Send Test path so the two behave
// identically.

import { BB_LOGO_URL, buildLetterVariables, type LetterVariables } from "./letter-renderer";
import { buildLetterPdfFromBytes } from "./letter-pdf";

export interface PdfBuildResult {
  base64: string;
  byteLength: number;
  base64Length: number;
  filename: string;
}

// Build a filename slug from a student name: allow letters/digits/hyphens.
export function studentFilenameSlug(studentName: string): string {
  const raw = (studentName || "Student").trim();
  const slug = raw.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return slug || "Student";
}

export function buildConfirmationFilename(studentName: string): string {
  return `${studentFilenameSlug(studentName)}-St-Lukes-Parking-Shuttle-Confirmation-2026-2027.pdf`;
}

// Validate a raw base64 string (no data URL prefix, no whitespace).
export function assertValidBase64(s: string, label: string): void {
  if (!s) throw new Error(`${label}: empty`);
  if (s.startsWith("data:")) throw new Error(`${label}: unexpected data URL prefix`);
  if (/\s/.test(s)) throw new Error(`${label}: whitespace in base64`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new Error(`${label}: not base64`);
}

// Fetch the B&B logo bytes from the same origin serving this request, then
// build the letter PDF and return raw base64 (no prefix) ready for Resend.
export async function buildConfirmationPdfBase64(params: {
  origin: string;
  templateBodyHtml: string;
  vars: LetterVariables;
  studentName: string;
}): Promise<PdfBuildResult> {
  const { origin, templateBodyHtml, vars, studentName } = params;
  const logoUrl = BB_LOGO_URL.startsWith("http") ? BB_LOGO_URL : origin + BB_LOGO_URL;
  const logoRes = await fetch(logoUrl);
  if (!logoRes.ok) throw new Error(`logo fetch failed: HTTP ${logoRes.status}`);
  const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
  if (logoBytes.byteLength < 100) throw new Error(`logo bytes too small (${logoBytes.byteLength})`);

  const { pdfBytes, base64 } = buildLetterPdfFromBytes(templateBodyHtml, vars, logoBytes);
  if (!pdfBytes || pdfBytes.byteLength < 500) {
    throw new Error(`PDF too small (${pdfBytes?.byteLength ?? 0} bytes)`);
  }
  assertValidBase64(base64, "PDF base64");
  const filename = buildConfirmationFilename(studentName);
  if (!filename.toLowerCase().endsWith(".pdf")) throw new Error("filename must end with .pdf");
  return { base64, byteLength: pdfBytes.byteLength, base64Length: base64.length, filename };
}

// Convenience: pick the paid amount from an incoming student payload the same
// way the letter preview does.
export function studentPaidAmount(student: {
  paymentType?: string;
  amountPaid?: number;
  familyPaid?: number;
}): number {
  return student.paymentType === "Financial Aid"
    ? (student.familyPaid ?? 0)
    : (student.amountPaid ?? 0);
}

export function makeLetterVariables(input: {
  studentName: string;
  parentName: string;
  amountPaid: number;
}): LetterVariables {
  return buildLetterVariables({
    studentName: input.studentName,
    parentName: input.parentName,
    amountPaid: input.amountPaid,
    paymentDate: new Date(),
    schoolYear: "2026–2027",
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export interface CoveringEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildCoveringEmail(input: {
  purchaserName: string;
  studentName: string;
}): CoveringEmail {
  const firstName = (input.purchaserName || "").trim().split(/\s+/)[0] || "there";
  const student = input.studentName || "your student";
  const subject = "St. Luke\u2019s Parking Shuttle Payment Confirmation (2026\u20132027)";
  const html =
    `<p>Hi ${escapeHtml(firstName)},</p>` +
    `<p>Attached is the 2026\u20132027 St. Luke\u2019s School Parking Shuttle payment confirmation for <strong>${escapeHtml(student)}</strong>.</p>` +
    `<p>Please keep this confirmation for your records.</p>` +
    `<p>Thank you,<br>B&amp;B Transportation<br>203-393-9750<br>` +
    `<a href="https://www.bandbtrans.com">www.bandbtrans.com</a></p>`;
  const text =
    `Hi ${firstName},\n\n` +
    `Attached is the 2026\u20132027 St. Luke\u2019s School Parking Shuttle payment confirmation for ${student}.\n\n` +
    `Please keep this confirmation for your records.\n\n` +
    `Thank you,\n` +
    `B&B Transportation\n` +
    `203-393-9750\n` +
    `www.bandbtrans.com`;
  return { subject, html, text };
}

export interface ResendSendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  pdfBase64: string;
  pdfFilename: string;
}

export interface ResendSendResult {
  ok: boolean;
  status: number;
  providerId: string | null;
  errorBody: string | null;
}

// POST directly to Resend with a base64 PDF attachment. Validates every
// field required by Resend before making the request so a broken payload
// never leaves the process.
export async function sendConfirmationViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  const key = process.env.RESEND_API_KEY || process.env.resend_api_key;
  if (!key) throw new Error("Resend API key is not configured (RESEND_API_KEY missing).");
  if (!input.to) throw new Error("Recipient email is required.");
  if (!input.subject) throw new Error("Email subject is required.");
  if (!input.html) throw new Error("HTML body is required.");
  if (!input.text) throw new Error("Plain-text body is required.");
  if (!input.pdfBase64) throw new Error("PDF attachment content is empty.");
  assertValidBase64(input.pdfBase64, "PDF attachment");
  if (!input.pdfFilename.toLowerCase().endsWith(".pdf")) {
    throw new Error("Attachment filename must end with .pdf");
  }

  console.log("[email] resend request", {
    to: input.to,
    subject: input.subject,
    htmlLength: input.html.length,
    textLength: input.text.length,
    pdfBase64Length: input.pdfBase64.length,
    filename: input.pdfFilename,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: "B&B Transportation <info@bandbtrans.com>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: [
        {
          filename: input.pdfFilename,
          content: input.pdfBase64,
        },
      ],
    }),
  });
  const bodyText = await res.text();
  let providerId: string | null = null;
  try {
    const j = JSON.parse(bodyText);
    providerId = j?.id || j?.message_id || null;
  } catch {
    /* keep text */
  }
  console.log("[email] resend response", {
    status: res.status,
    ok: res.ok,
    providerId,
    body: res.ok ? undefined : bodyText.slice(0, 500),
  });
  return {
    ok: res.ok,
    status: res.status,
    providerId,
    errorBody: res.ok ? null : bodyText.slice(0, 500),
  };
}
