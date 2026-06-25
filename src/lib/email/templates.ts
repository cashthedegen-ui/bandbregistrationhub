// Branded HTML email templates for B&B Transportation.

const BRAND = {
  name: "B and B Transportation",
  tagline: "Student transportation since 1989",
  phone: "(203) 393-9750",
  email: "info@bandbtrans.com",
  accent: "#0f172a",
};

function shell(opts: { preheader?: string; bodyHtml: string }) {
  const { preheader = "", bodyHtml } = opts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:24px 32px;border-bottom:1px solid #e7e5e4;">
            <div style="font-size:18px;font-weight:700;color:${BRAND.accent};">${BRAND.name}</div>
            <div style="font-size:12px;color:#78716c;margin-top:2px;">${BRAND.tagline}</div>
          </td></tr>
          <tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#1c1917;">
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;">
            ${BRAND.name} &middot; ${BRAND.phone} &middot;
            <a href="mailto:${BRAND.email}" style="color:#78716c;text-decoration:underline;">${BRAND.email}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function testEmailTemplate(recipient: string) {
  const sentAt = new Date().toLocaleString("en-US");
  return {
    subject: "Test email from B and B Transportation",
    html: shell({
      preheader: "Resend is wired up correctly.",
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;">Email delivery is working</h1>
        <p style="margin:0 0 12px;">This is a test message confirming that the B and B Transit app can send branded email through Resend.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e7e5e4;border-radius:8px;">
          <tr><td style="padding:12px 16px;font-size:13px;color:#57534e;">Recipient</td><td style="padding:12px 16px;font-size:13px;font-weight:600;">${recipient}</td></tr>
          <tr><td style="padding:12px 16px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Sent</td><td style="padding:12px 16px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${sentAt}</td></tr>
        </table>
        <p style="margin:0;color:#57534e;font-size:13px;">No action is required. You can ignore this message.</p>
      `,
    }),
  };
}

export function runSheetEmailTemplate(opts: {
  schoolName: string;
  routeName: string;
  date: string;
  session: string;
  driverName: string;
  busNumber: string;
  riderCount: number;
  intro?: string;
}) {
  const dateLabel = opts.date
    ? new Date(`${opts.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "—";
  return {
    subject: `Run Sheet — ${opts.schoolName} · ${opts.routeName} · ${dateLabel} (${opts.session})`,
    html: shell({
      preheader: `Run sheet for ${opts.routeName} on ${dateLabel}.`,
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;">Daily Run Sheet</h1>
        ${opts.intro ? `<p style="margin:0 0 16px;">${opts.intro.replace(/</g, "&lt;")}</p>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;border:1px solid #e7e5e4;border-radius:8px;width:100%;">
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;width:40%;">School</td><td style="padding:10px 14px;font-size:13px;font-weight:600;">${opts.schoolName}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Route</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${opts.routeName}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Date</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${dateLabel}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Session</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${opts.session}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Driver</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${opts.driverName || "—"}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Bus #</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${opts.busNumber || "—"}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#57534e;border-top:1px solid #e7e5e4;">Riders</td><td style="padding:10px 14px;font-size:13px;font-weight:600;border-top:1px solid #e7e5e4;">${opts.riderCount}</td></tr>
        </table>
        <p style="margin:0;color:#57534e;font-size:13px;">The full run sheet is attached as a PDF.</p>
      `,
    }),
  };
}
