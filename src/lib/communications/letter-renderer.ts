// Shared renderer for the St. Luke's Parking Shuttle confirmation letter.
// The layout, header, footer, school-year band, and title are fixed —
// only the two body paragraphs and Date/Amount/Purchaser lines are dynamic
// (via {{ variables }} in the stored template body).
//
// Used by:
//   - Communications template preview
//   - Send Confirmation preview modal
//   - Send Test (identical rendering)
//   - jsPDF PDF generator (matching structure)

const CURRENCY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export interface LetterVariables {
  student_name: string;
  parent_name: string;
  amount_paid: string;   // pre-formatted "$1,437.00"
  payment_date: string;  // "8/28/2025" style
  school_year: string;   // "2026–2027"
}

export function buildLetterVariables(input: {
  studentName?: string;
  parentName?: string;
  amountPaid?: number | null;
  paymentDate?: string | Date | null;
  schoolYear?: string;
}): LetterVariables {
  const dt =
    input.paymentDate instanceof Date
      ? input.paymentDate
      : input.paymentDate
      ? new Date(input.paymentDate)
      : new Date();
  const dateStr = isNaN(dt.getTime())
    ? new Date().toLocaleDateString("en-US")
    : dt.toLocaleDateString("en-US");
  return {
    student_name: input.studentName?.trim() || "",
    parent_name: input.parentName?.trim() || "",
    amount_paid: CURRENCY.format(Number(input.amountPaid ?? 0)),
    payment_date: dateStr,
    school_year: input.schoolYear || "2026–2027",
  };
}

export function interpolateLetterBody(body: string, vars: LetterVariables): { html: string; missing: string[] } {
  const missing: string[] = [];
  const html = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = (vars as unknown as Record<string, string>)[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (!missing.includes(key)) missing.push(key);
      return `{{${key}}}`;
    }
    return String(v);
  });
  return { html, missing };
}

// The logo is drawn as inline SVG so it renders identically in the on-screen
// preview and the emailed HTML — no external asset needed.
export const BB_LOGO_SVG = `
<svg viewBox="0 0 420 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="B and B Transportation, Inc.">
  <g fill="#4b5563" font-family="Georgia, 'Times New Roman', serif">
    <text x="60" y="46" font-size="42" font-weight="700" letter-spacing="1">B</text>
    <text x="105" y="46" font-size="20" font-style="italic" font-weight="400">AND</text>
    <text x="160" y="46" font-size="42" font-weight="700" letter-spacing="1">B</text>
    <line x1="30" y1="58" x2="400" y2="58" stroke="#4b5563" stroke-width="1.2"/>
    <line x1="30" y1="62" x2="400" y2="62" stroke="#4b5563" stroke-width="1.2"/>
    <text x="60" y="82" font-size="22" font-weight="700" letter-spacing="2">TRANSPORTATION, INC.</text>
    <text x="60" y="102" font-size="13" font-style="italic" fill="#6b7280">"transporting the world's most precious cargo"</text>
  </g>
</svg>`;

// Fully-rendered letter HTML (paper-styled). Used for on-page preview
// (wrapped in a container) and for the outgoing email body.
export function renderLetterHtml(opts: {
  templateBodyHtml: string;
  vars: LetterVariables;
  standalone?: boolean; // true = full <html> doc (for email)
}): { html: string; missing: string[] } {
  const { html: bodyHtml, missing } = interpolateLetterBody(opts.templateBodyHtml, opts.vars);

  const inner = `
<div class="bb-letter" style="
  box-sizing:border-box;
  width:8.5in; max-width:100%;
  min-height:11in;
  padding:0.75in 0.85in 0.55in;
  background:#ffffff; color:#1f2937;
  font-family: 'Century Gothic', 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size:14px; line-height:1.55;
  position:relative;
">
  <div style="display:flex; justify-content:center; padding-bottom:8px;">
    <div style="width:340px;">${BB_LOGO_SVG}</div>
  </div>
  <hr style="border:none; border-top:1px solid #9ca3af; margin:4px 0 40px;"/>

  <div style="text-align:center; font-size:34px; color:#6b7280; font-weight:400; letter-spacing:2px; margin-bottom:14px;">
    ${escapeHtml(opts.vars.school_year)}
  </div>
  <div style="text-align:center; font-size:26px; color:#4b5563; font-weight:400; margin-bottom:34px;">
    St Luke&rsquo;s School Parking Shuttle
  </div>

  <div class="bb-letter-body" style="font-size:15px; color:#4b5563;">
    ${bodyHtml}
  </div>

  <div style="position:absolute; left:0.85in; right:0.85in; bottom:0.45in;">
    <hr style="border:none; border-top:1px solid #9ca3af; margin:0 0 6px;"/>
    <div style="display:flex; justify-content:space-between; font-size:11px; color:#4b5563; letter-spacing:0.5px;">
      <span>41 VILLAGE LN BETHANY, CT</span>
      <span>PH: 203-393-9750</span>
      <span>FX: 203-393-7360</span>
      <span>WWW.BANDBTRANS.COM</span>
    </div>
  </div>
</div>`;

  if (!opts.standalone) return { html: inner, missing };

  const doc = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>B and B Transportation — Payment Confirmation</title>
<style>
  body { margin:0; padding:0; background:#f5f5f4; }
  .bb-letter-body p { margin:0 0 14px; }
  .bb-letter-body strong { color:#1f2937; font-weight:700; }
  @media print { body { background:#fff; } .bb-letter { box-shadow:none !important; } }
</style>
</head><body>${inner}</body></html>`;
  return { html: doc, missing };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export const SAMPLE_LETTER_VARIABLES: LetterVariables = {
  student_name: "Sarah Thompson",
  parent_name: "Michael Thompson",
  amount_paid: "$1,437.00",
  payment_date: new Date().toLocaleDateString("en-US"),
  school_year: "2026–2027",
};
