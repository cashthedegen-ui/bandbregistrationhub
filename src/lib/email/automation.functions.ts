import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SendAutomationInput {
  templateKey: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;          // optional override
  bodyHtml?: string;         // optional override
  variables?: Record<string, string | number | undefined>;
  attachments?: { filename: string; content: string }[];
  metadata?: Record<string, unknown>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanList = (v: unknown): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
};

function interpolate(input: string, vars: Record<string, string | number | undefined>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

function brandedShell(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
<tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e7e5e4;">
<div style="font-size:18px;font-weight:700;color:#0f172a;">B and B Transportation</div>
<div style="font-size:12px;color:#78716c;margin-top:2px;">Student transportation since 1989</div>
</td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#1c1917;">${bodyHtml}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;">
B and B Transportation &middot; (203) 393-9750 &middot;
<a href="mailto:info@bandbtrans.com" style="color:#78716c;text-decoration:underline;">info@bandbtrans.com</a>
</td></tr></table></td></tr></table></body></html>`;
}

export const sendAutomationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendAutomationInput) => {
    const to = cleanList(data?.to);
    const cc = cleanList(data?.cc);
    const bcc = cleanList(data?.bcc);
    if (!data?.templateKey) throw new Error("Missing template key.");
    if (to.length === 0) throw new Error("Add at least one recipient.");
    for (const e of [...to, ...cc, ...bcc]) {
      if (!EMAIL_RE.test(e)) throw new Error(`Invalid email address: ${e}`);
    }
    return {
      templateKey: data.templateKey,
      to,
      cc,
      bcc,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      variables: data.variables || {},
      attachments: data.attachments || [],
      metadata: data.metadata || {},
    };
  })
  .handler(async ({ data, context }) => {
    const { sendEmail } = await import("./service.server");
    const { supabase, claims } = context;
    // email_history writes are admin-restricted at the RLS layer; use the
    // service-role client so legitimate sends from any signed-in staff member
    // are still logged without granting them direct write access to the table.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load template from DB unless full overrides provided
    let subject = data.subject || "";
    let bodyHtml = data.bodyHtml || "";
    if (!subject || !bodyHtml) {
      const { data: tpl, error } = await supabase
        .from("email_templates")
        .select("subject,body_html")
        .eq("key", data.templateKey)
        .maybeSingle();
      if (error) throw new Error(`Failed to load template: ${error.message}`);
      if (!tpl) throw new Error(`Template "${data.templateKey}" not found.`);
      if (!subject) subject = tpl.subject || "";
      if (!bodyHtml) bodyHtml = tpl.body_html || "";
    }

    const vars = data.variables;
    const renderedSubject = interpolate(subject, vars);
    const renderedBody = interpolate(bodyHtml, vars);
    const html = brandedShell(renderedBody);

    const result = await sendEmail({
      to: data.to,
      cc: data.cc.length ? data.cc : undefined,
      bcc: data.bcc.length ? data.bcc : undefined,
      subject: renderedSubject,
      html,
      attachments: data.attachments.length ? data.attachments : undefined,
    });

    // Capture sender identity from JWT claims for the audit trail
    const c = (claims ?? {}) as Record<string, unknown>;
    const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
    const sentByEmail = (c.email as string) || null;
    const sentByName = (meta.full_name as string) || (meta.name as string) || null;

    const baseLog = {
      template_key: data.templateKey,
      recipient: data.to.join(", "),
      cc: data.cc.length ? data.cc.join(", ") : null,
      bcc: data.bcc.length ? data.bcc.join(", ") : null,
      subject: renderedSubject,
      sent_by_email: sentByEmail,
      sent_by_name: sentByName,
      metadata: data.metadata as never,
    };
    if (result.ok) {
      await supabaseAdmin.from("email_history").insert({
        ...baseLog,
        status: "sent",
        resend_id: result.id,
      });
      return { ok: true, id: result.id };
    } else {
      await supabaseAdmin.from("email_history").insert({
        ...baseLog,
        status: "failed",
        error: result.error,
      });
      throw new Error(result.error);
    }
  });
