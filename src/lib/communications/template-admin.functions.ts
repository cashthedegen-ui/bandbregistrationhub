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

// Send Test: renders the confirmation PDF with sample variables and sends
// a real email via Resend with the PDF attached, so testers see exactly
// what a family would receive. Does NOT enforce duplicate protection and
// logs the send with is_test=true.
export const sendTestCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { templateId: string; testEmail: string; renderedSubject?: string; renderedBody?: string }) => {
    if (!data?.templateId) throw new Error("Missing template id.");
    if (!data?.testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.testEmail)) {
      throw new Error("A valid test email address is required.");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; status: string; message?: string; logId: string | null }> => {
    await requireAdmin(context);
    const c = (context.claims ?? {}) as Record<string, unknown>;
    const initiatedByEmail = (c.email as string) || null;

    const { data: tpl, error: tplErr } = await (context.supabase as any)
      .from("communication_templates")
      .select("id, template_name, communication_type, school_or_program, email_body")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template not found.");

    const { getRequest } = await import("@tanstack/react-start/server");
    const {
      buildConfirmationPdfBase64,
      makeLetterVariables,
      buildCoveringEmail,
      sendConfirmationViaResend,
    } = await import("./pdf-send");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Use sample-but-plausible data for the letter body.
    const sampleStudentName = "Sarah Thompson";
    const samplePurchaserName = "Michael Thompson";

    let pdfBase64: string;
    let pdfFilename: string;
    let pdfByteLength = 0;
    let base64Length = 0;
    try {
      const origin = new URL(getRequest().url).origin;
      const letterVars = makeLetterVariables({
        studentName: sampleStudentName,
        parentName: samplePurchaserName,
        amountPaid: 1437,
        shuttleLocation: tpl.school_or_program || "St. Luke\u2019s School",
      });
      const built = await buildConfirmationPdfBase64({
        origin,
        templateBodyHtml: tpl.email_body || "",
        vars: letterVars,
        studentName: sampleStudentName,
      });
      pdfBase64 = built.base64;
      pdfFilename = built.filename;
      pdfByteLength = built.byteLength;
      base64Length = built.base64Length;
      console.log("[sendTestCommunication] pdf built", { pdfByteLength, base64Length, filename: pdfFilename });
    } catch (e: any) {
      const reason = `PDF generation failed: ${e?.message || String(e)}`.slice(0, 500);
      console.error("[sendTestCommunication] PDF generation error", {
        message: e?.message,
        cause: e?.cause ? String(e.cause) : undefined,
        stack: e?.stack,
      });
      return { ok: false, logId: null, status: "failed", message: reason };
    }

    const cover = buildCoveringEmail({
      purchaserName: samplePurchaserName,
      studentName: sampleStudentName,
      program: tpl.school_or_program,
      templateName: tpl.template_name,
    });
    const testSubject = `[TEST] ${cover.subject}`;

    let resendOk = false;
    let resendStatus = 0;
    let providerId: string | null = null;
    let errorBody: string | null = null;
    try {
      const result = await sendConfirmationViaResend({
        to: data.testEmail,
        subject: testSubject,
        html: cover.html,
        text: cover.text,
        pdfBase64,
        pdfFilename,
      });
      resendOk = result.ok;
      resendStatus = result.status;
      providerId = result.providerId;
      errorBody = result.errorBody;
      console.log("[sendTestCommunication] resend result", {
        ok: resendOk,
        status: resendStatus,
        providerId,
        pdfByteLength,
        base64Length,
        filename: pdfFilename,
        error: errorBody,
      });
    } catch (e: any) {
      errorBody = (e?.message ? String(e.message) : "Network error contacting Resend.").slice(0, 500);
      console.error("[sendTestCommunication] " + errorBody);
    }

    const finalStatus = resendOk ? "sent" : "failed";
    const failureReason = resendOk
      ? null
      : (errorBody ? `Resend ${resendStatus}: ${errorBody}` : `Resend ${resendStatus}`).slice(0, 500);

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
        rendered_subject: testSubject,
        rendered_body: cover.html,
        channel: "email",
        status: finalStatus,
        is_test: true,
        initiated_by: context.userId,
        initiated_by_email: initiatedByEmail,
        provider_message_id: providerId,
        failure_reason: failureReason,
        delivered_at: resendOk ? new Date().toISOString() : null,
        metadata: { is_test: true, pdf_bytes: pdfByteLength } as any,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const logId = logRow.id as string;

    if (resendOk) return { ok: true, logId, status: "sent", message: "Test email sent." };
    return { ok: false, logId, status: "failed", message: failureReason || `Email send failed (${resendStatus}).` };
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
