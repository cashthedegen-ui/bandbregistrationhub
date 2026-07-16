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

// Fetch the B&B logo bytes. Tries a list of candidate URLs (request origin
// first, then known-public Lovable hosts) so a Worker self-fetch failure or
// missing preview asset route doesn't kill the whole PDF build. Every fetch
// is wrapped and its URL / status / body preview / stack are logged.
async function fetchLogoBytes(origin: string): Promise<{ bytes: Uint8Array; url: string }> {
  const path = BB_LOGO_URL;
  const candidates: string[] = [];
  const push = (u: string) => {
    if (!u) return;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)) return;
    if (!candidates.includes(u)) candidates.push(u);
  };
  if (path.startsWith("http")) push(path);
  else {
    if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) push(origin.replace(/\/$/, "") + path);
    push("https://bandbregistrationhub.lovable.app" + path);
    push("https://project--28914fd9-acbb-4989-9331-17763ec76f37.lovable.app" + path);
    push("https://project--28914fd9-acbb-4989-9331-17763ec76f37-dev.lovable.app" + path);
  }
  console.log("[pdf] logo fetch candidates", { origin, path, candidates });

  const errors: string[] = [];
  for (const url of candidates) {
    console.log("[pdf] fetching logo", { url });
    try {
      const res = await fetch(url);
      const ct = res.headers.get("content-type") || "";
      console.log("[pdf] logo response", { url, status: res.status, ok: res.ok, contentType: ct });
      if (!res.ok) {
        let bodyPreview = "";
        try { bodyPreview = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        errors.push(`HTTP ${res.status} @ ${url} :: ${bodyPreview}`);
        continue;
      }
      if (ct.includes("text/html")) {
        errors.push(`Expected image, got text/html @ ${url}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength < 100) {
        errors.push(`Logo too small (${bytes.byteLength}) @ ${url}`);
        continue;
      }
      console.log("[pdf] logo fetched", { url, bytes: bytes.byteLength });
      return { bytes, url };
    } catch (e: any) {
      console.error("[pdf] logo fetch threw", {
        url,
        message: e?.message || String(e),
        cause: e?.cause ? String(e.cause) : undefined,
        stack: e?.stack,
      });
      errors.push(`${e?.message || String(e)} @ ${url}`);
    }
  }
  throw new Error(`Logo fetch failed for all candidates: ${errors.join(" | ")}`);
}

// Verify every field the family-facing PDF renders. Throws with a clear
// message listing which fields are blank so the send is blocked before an
// email is created.
function validateLetterVars(vars: LetterVariables): void {
  const missing: string[] = [];
  const check = (v: string | undefined, label: string) => {
    if (!v || !String(v).trim()) missing.push(label);
  };
  check(vars.student_name, "student name");
  check(vars.parent_name, "purchaser name");
  check(vars.amount_paid, "amount paid");
  check(vars.payment_date, "payment date");
  check(vars.school_year, "school year");
  check(vars.shuttle_location, "shuttle location");
  // amount_paid is pre-formatted currency; a raw "$0.00" is valid but a
  // literal empty currency string should never occur.
  if (missing.length > 0) {
    throw new Error(
      `Cannot generate confirmation PDF — missing required field(s): ${missing.join(", ")}.`,
    );
  }
}

export async function buildConfirmationPdfBase64(params: {
  origin: string;
  templateBodyHtml: string;
  vars: LetterVariables;
  studentName: string;
}): Promise<PdfBuildResult> {
  const { origin, templateBodyHtml, vars, studentName } = params;
  console.log("[pdf] build start", {
    origin,
    studentName,
    vars,
    BB_LOGO_URL,
  });

  validateLetterVars(vars);

  let logoBytes: Uint8Array;
  let logoUrlUsed: string;
  try {
    const r = await fetchLogoBytes(origin);
    logoBytes = r.bytes;
    logoUrlUsed = r.url;
  } catch (e: any) {
    console.error("[pdf] logo stage failed", { message: e?.message, stack: e?.stack });
    throw new Error(`logo fetch failed: ${e?.message || String(e)}`);
  }

  let built: { pdfBytes: Uint8Array; base64: string };
  try {
    built = buildLetterPdfFromBytes(templateBodyHtml, vars, logoBytes);
  } catch (e: any) {
    console.error("[pdf] jsPDF render failed", {
      message: e?.message,
      stack: e?.stack,
      logoUrlUsed,
      logoBytesLength: logoBytes.byteLength,
    });
    throw new Error(`PDF render failed: ${e?.message || String(e)}`);
  }
  const { pdfBytes, base64 } = built;
  if (!pdfBytes || pdfBytes.byteLength < 500) {
    throw new Error(`PDF too small (${pdfBytes?.byteLength ?? 0} bytes)`);
  }
  // The layout is one page by construction; sanity-check that jsPDF didn't
  // spill onto a second page (would indicate a wrapping regression).
  const pageCount = countPdfPages(pdfBytes);
  if (pageCount !== 1) {
    throw new Error(`Confirmation PDF must be a single page, got ${pageCount}.`);
  }
  assertValidBase64(base64, "PDF base64");
  const filename = buildConfirmationFilename(studentName);
  if (!filename.toLowerCase().endsWith(".pdf")) throw new Error("filename must end with .pdf");
  console.log("[pdf] build ok", {
    logoUrlUsed,
    logoBytes: logoBytes.byteLength,
    pdfByteLength: pdfBytes.byteLength,
    base64Length: base64.length,
    pageCount,
    filename,
  });
  return { base64, byteLength: pdfBytes.byteLength, base64Length: base64.length, filename };
}

// Count "/Type /Page" occurrences (excluding /Pages) in the raw PDF bytes.
// Cheap heuristic that's plenty accurate for our generated documents.
function countPdfPages(bytes: Uint8Array): number {
  const s = typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("latin1")
    : Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  const matches = s.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
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
  paymentDate?: string | Date | null;
  shuttleLocation?: string;
}): LetterVariables {
  return buildLetterVariables({
    studentName: input.studentName,
    parentName: input.parentName,
    amountPaid: input.amountPaid,
    paymentDate: input.paymentDate ?? new Date(),
    schoolYear: "2026\u20132027",
    shuttleLocation: input.shuttleLocation,
  });
}
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

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
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
  } catch (e: any) {
    console.error("[email] resend fetch threw", {
      url: "https://api.resend.com/emails",
      message: e?.message || String(e),
      cause: e?.cause ? String(e.cause) : undefined,
      stack: e?.stack,
    });
    throw new Error(`Resend fetch failed: ${e?.message || String(e)}`);
  }
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
