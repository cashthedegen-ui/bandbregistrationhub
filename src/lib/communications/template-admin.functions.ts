import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Admin-only template management: fetch, edit, versions, and Send Test.
// All privileged mutations are authorized by verifying has_role(admin) via
// the caller's RLS-scoped client — never using service role to establish
// authorization.

async function requireAdmin(context: any): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(`Authorization check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required.");
}

export interface TemplateFull {
  id: string;
  template_name: string;
  communication_type: string;
  school_or_program: string;
  form_id: string | null;
  subject: string;
  email_body: string;
  active: boolean;
  eligibility_rules: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export const getCommunicationTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing template id.");
    return data;
  })
  .handler(async ({ data, context }): Promise<TemplateFull> => {
    const { data: row, error } = await (context.supabase as any)
      .from("communication_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found.");
    return row as TemplateFull;
  });

export const updateCommunicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; template_name?: string; subject?: string; email_body?: string; active?: boolean }) => {
    if (!data?.id) throw new Error("Missing template id.");
    return data;
  })
  .handler(async ({ data, context }): Promise<TemplateFull> => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = { updated_by: context.userId };
    if (data.template_name !== undefined) patch.template_name = data.template_name;
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.email_body !== undefined) patch.email_body = data.email_body;
    if (data.active !== undefined) patch.active = data.active;
    const { data: row, error } = await (context.supabase as any)
      .from("communication_templates")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as TemplateFull;
  });

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version_number: number;
  template_name: string;
  subject: string;
  email_body: string;
  saved_by_email: string | null;
  saved_at: string;
}

export const listCommunicationTemplateVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing template id.");
    return data;
  })
  .handler(async ({ data, context }): Promise<TemplateVersionRow[]> => {
    await requireAdmin(context);
    const { data: rows, error } = await (context.supabase as any)
      .from("communication_template_versions")
      .select("id, template_id, version_number, template_name, subject, email_body, saved_by_email, saved_at")
      .eq("template_id", data.id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TemplateVersionRow[];
  });

// Send Test: renders the template with sample variables and posts to n8n
// with is_test=true. Does NOT create production history rows for a student,
// does NOT change payment status, does NOT enforce duplicate protection.
export const sendTestCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { templateId: string; testEmail: string; renderedSubject: string; renderedBody: string }) => {
    if (!data?.templateId) throw new Error("Missing template id.");
    if (!data?.testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.testEmail)) {
      throw new Error("A valid test email address is required.");
    }
    if (!data?.renderedSubject || !data?.renderedBody) {
      throw new Error("Rendered content is required.");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; status: string; message?: string; logId: string | null }> => {
    await requireAdmin(context);
    const c = (context.claims ?? {}) as Record<string, unknown>;
    const initiatedByEmail = (c.email as string) || null;

    const webhookUrl = process.env.N8N_WEBHOOK_URL || "";
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "";
    // TEMP diagnostic: presence only, never the value.
    console.log("[sendTestCommunication] secrets:", {
      has_webhook_url: !!webhookUrl,
      has_webhook_secret: !!webhookSecret,
    });

    if (!webhookUrl) {
      // Do NOT create a queued record when the webhook isn't even attempted.
      return {
        ok: false,
        logId: null,
        status: "failed",
        message:
          "n8n webhook URL is not configured. Save N8N_WEBHOOK_URL in backend secrets to enable sending.",
      };
    }

    const { data: tpl, error: tplErr } = await (context.supabase as any)
      .from("communication_templates")
      .select("id, template_name, communication_type, school_or_program")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Post to n8n FIRST — only record after the webhook has actually been attempted.
    let n8nStatus = 0;
    let n8nText = "";
    let n8nOk = false;
    let providerMessageId: string | null = null;
    let networkError: string | null = null;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "X-Webhook-Secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: "send_test_communication",
          is_test: true,
          template_id: tpl.id,
          template_name: tpl.template_name,
          recipient_email: data.testEmail,
          subject: `[TEST] ${data.renderedSubject}`,
          html_body: data.renderedBody,
          initiated_by: initiatedByEmail,
          requested_at: new Date().toISOString(),
        }),
      });
      n8nStatus = res.status;
      n8nText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(n8nText); } catch { /* text response */ }
      const jsonSaysFailed = parsed && typeof parsed === "object" && parsed.success === false;
      n8nOk = res.ok && !jsonSaysFailed;
      if (parsed && typeof parsed === "object") {
        providerMessageId = parsed.message_id || parsed.id || parsed.provider_message_id || null;
      }
    } catch (e: any) {
      networkError = e?.message ? String(e.message) : "Network error contacting n8n.";
    }

    const finalStatus = n8nOk ? "sent" : "failed";
    const failureReason = n8nOk
      ? null
      : networkError
        ? networkError.slice(0, 500)
        : `n8n ${n8nStatus}: ${n8nText.slice(0, 500)}`;

    const { data: logRow, error: insErr } = await (supabaseAdmin as any)
      .from("communication_logs")
      .insert({
        template_id: tpl.id,
        template_name: `${tpl.template_name} (TEST)`,
        student_id: null,
        student_name: null,
        parent_name: null,
        recipient_email: data.testEmail,
        communication_type: tpl.communication_type,
        school_or_program: tpl.school_or_program,
        rendered_subject: `[TEST] ${data.renderedSubject}`,
        rendered_body: data.renderedBody,
        channel: "email",
        status: finalStatus,
        is_test: true,
        initiated_by: context.userId,
        initiated_by_email: initiatedByEmail,
        provider_message_id: providerMessageId,
        failure_reason: failureReason,
        delivered_at: n8nOk ? new Date().toISOString() : null,
        metadata: { is_test: true } as any,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const logId = logRow.id as string;

    if (n8nOk) {
      return { ok: true, logId, status: "sent", message: "Test email sent." };
    }
    return {
      ok: false,
      logId,
      status: "failed",
      message: failureReason || `n8n error ${n8nStatus}`,
    };
  });

// Convenience: does the caller have the admin role?
export const currentUserIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return false;
    return !!data;
  });
