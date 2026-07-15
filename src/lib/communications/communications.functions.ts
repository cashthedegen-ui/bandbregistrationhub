import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Communications system: send confirmation / reminder emails to families
// via an external n8n workflow. All sends are staff-initiated, previewed,
// and logged. This function is the ONLY authorized send path.

export interface SendCommunicationInput {
  templateId: string;
  student: {
    id: string;
    submissionId: string;
    formId: string;
    schoolName: string;
    studentName: string;
    grade: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    submissionDate: string;
    paymentStatus: string;
    paymentType?: string;
    amountPaid?: number;
    familyPaid?: number;
    schoolOwes?: number;
    rtAmount?: number;
    owAmount?: number;
  };
  // If true, allow sending again even if a matching send already exists.
  force?: boolean;
}

export interface SendCommunicationResult {
  ok: boolean;
  logId: string;
  status: "sent" | "processing" | "failed";
  message?: string;
}

const CURRENCY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function currency(n: number | undefined | null): string {
  return CURRENCY.format(Number(n ?? 0));
}

function interpolate(input: string, vars: Record<string, string>): { output: string; missing: string[] } {
  const missing: string[] = [];
  const output = input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (!missing.includes(key)) missing.push(key);
      return `{{${key}}}`;
    }
    return String(v);
  });
  return { output, missing };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const sendCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendCommunicationInput) => {
    if (!data?.templateId) throw new Error("Missing template id.");
    if (!data?.student?.id) throw new Error("Missing student.");
    return data;
  })
  .handler(async ({ data, context }): Promise<SendCommunicationResult> => {
    const { supabase, userId, claims } = context;
    const c = (claims ?? {}) as Record<string, unknown>;
    const initiatedByEmail = (c.email as string) || null;

    // 1. Load template as the caller (RLS-scoped read)
    const { data: tpl, error: tplErr } = await (supabase as any)
      .from("communication_templates")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(`Failed to load template: ${tplErr.message}`);
    if (!tpl) throw new Error("Template not found.");
    if (!tpl.active) throw new Error("Template is inactive.");

    const student = data.student;

    // 2. Server-side eligibility validation
    const rules = (tpl.eligibility_rules || {}) as Record<string, unknown>;
    if (tpl.form_id && String(tpl.form_id) !== String(student.formId)) {
      throw new Error(
        `This template only applies to form ${tpl.form_id}, but this student came from form ${student.formId}.`,
      );
    }
    if (rules.require_payment_received && student.paymentStatus !== "Received") {
      throw new Error("Payment must be marked as received before this confirmation can be sent.");
    }
    if (rules.require_parent_email && !student.parentEmail) {
      throw new Error("Parent email is missing for this student.");
    }
    if (!student.parentEmail) throw new Error("Recipient email is required.");

    // 3. Build variables + render subject/body
    const paidAmount =
      student.paymentType === "Financial Aid"
        ? (student.familyPaid ?? 0)
        : (student.amountPaid ?? 0);
    const remainingBalance =
      student.paymentType === "Financial Aid"
        ? Math.max(0, (student.schoolOwes ?? 0))
        : Math.max(
            0,
            (student.rtAmount ?? 0) + (student.owAmount ?? 0) - (student.amountPaid ?? 0),
          );

    const vars: Record<string, string> = {
      parent_name: student.parentName || "",
      student_name: student.studentName || "",
      grade: student.grade || "",
      school_program: student.schoolName || "",
      payment_status: student.paymentStatus || "",
      payment_type: student.paymentType || "",
      amount_paid: currency(paidAmount),
      remaining_balance: currency(remainingBalance),
      registration_date: student.submissionDate
        ? new Date(student.submissionDate).toLocaleDateString()
        : "",
      school_year: "2026 – 2027",
      due_date: "",
      payment_link: "",
    };

    const subj = interpolate(tpl.subject || "", vars);
    const body = interpolate(tpl.email_body || "", vars);
    const missing = Array.from(new Set([...subj.missing, ...body.missing]));
    if (missing.length > 0) {
      throw new Error(
        `Missing required data for this template: ${missing.join(", ")}. Please update the student record and try again.`,
      );
    }

    const renderedSubject = subj.output;
    const renderedBody = body.output;
    const plainBody = stripHtml(renderedBody);

    // 4. Duplicate protection: previous successful send for this student/template
    if (!data.force) {
      const { data: prior } = await (supabase as any)
        .from("communication_logs")
        .select("id, initiated_at, status")
        .eq("student_id", student.id)
        .eq("template_id", tpl.id)
        .in("status", ["sent", "processing", "queued"])
        .order("initiated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.id) {
        const err: any = new Error(
          `This confirmation was already sent on ${new Date(prior.initiated_at).toLocaleString()}.`,
        );
        err.code = "already_sent";
        err.previousLogId = prior.id;
        err.previousSentAt = prior.initiated_at;
        throw err;
      }
    }

    // 5. Insert queued log via admin client (RLS blocks direct client writes)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const insertPayload = {
      template_id: tpl.id,
      template_name: tpl.template_name,
      student_id: student.id,
      student_name: student.studentName,
      parent_name: student.parentName,
      recipient_email: student.parentEmail,
      recipient_phone: student.parentPhone || null,
      communication_type: tpl.communication_type,
      school_or_program: tpl.school_or_program,
      rendered_subject: renderedSubject,
      rendered_body: renderedBody,
      channel: "email",
      status: "queued",
      initiated_by: userId,
      initiated_by_email: initiatedByEmail,
      metadata: {
        form_id: student.formId,
        submission_id: student.submissionId,
        payment_status: student.paymentStatus,
      } as any,
    };
    const { data: logRow, error: insErr } = await (supabaseAdmin as any)
      .from("communication_logs")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr) throw new Error(`Failed to record log: ${insErr.message}`);
    const logId = logRow.id as string;

    // 6. Post to n8n webhook
    const webhookUrl = process.env.N8N_WEBHOOK_URL || "";
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "";

    if (!webhookUrl) {
      await (supabaseAdmin as any)
        .from("communication_logs")
        .update({
          status: "failed",
          failure_reason:
            "n8n webhook is not configured yet. Save N8N_WEBHOOK_URL (and N8N_WEBHOOK_SECRET) in backend secrets to enable sending.",
        })
        .eq("id", logId);
      return {
        ok: false,
        logId,
        status: "failed",
        message:
          "n8n webhook is not configured yet. The message was recorded as failed. Add the N8N webhook URL in backend secrets to enable delivery.",
      };
    }

    await (supabaseAdmin as any)
      .from("communication_logs")
      .update({ status: "processing" })
      .eq("id", logId);

    const outbound = {
      event: "send_communication",
      communication_log_id: logId,
      template_id: tpl.id,
      template_name: tpl.template_name,
      student_id: student.id,
      student_name: student.studentName,
      parent_name: student.parentName,
      recipient_email: student.parentEmail,
      recipient_phone: student.parentPhone || null,
      school_program: tpl.school_or_program,
      communication_type: tpl.communication_type,
      subject: renderedSubject,
      html_body: renderedBody,
      plain_text_body: plainBody,
      initiated_by: initiatedByEmail,
      requested_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "X-Webhook-Secret": webhookSecret } : {}),
        },
        body: JSON.stringify(outbound),
      });
      const respText = await res.text();
      if (!res.ok) {
        await (supabaseAdmin as any)
          .from("communication_logs")
          .update({
            status: "failed",
            failure_reason: `n8n returned ${res.status}: ${respText.slice(0, 500)}`,
          })
          .eq("id", logId);
        return { ok: false, logId, status: "failed", message: `n8n error ${res.status}` };
      }
      let providerId: string | null = null;
      try {
        const j = JSON.parse(respText);
        providerId = j?.message_id || j?.id || j?.provider_message_id || null;
      } catch {
        /* keep as-is */
      }
      await (supabaseAdmin as any)
        .from("communication_logs")
        .update({
          status: "sent",
          provider_message_id: providerId,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", logId);
      return { ok: true, logId, status: "sent" };
    } catch (e: any) {
      await (supabaseAdmin as any)
        .from("communication_logs")
        .update({
          status: "failed",
          failure_reason: e?.message ? String(e.message).slice(0, 500) : "Network error contacting n8n.",
        })
        .eq("id", logId);
      return { ok: false, logId, status: "failed", message: e?.message || "Send failed." };
    }
  });

export interface CommunicationLogRow {
  id: string;
  template_id: string | null;
  template_name: string | null;
  student_id: string | null;
  student_name: string | null;
  parent_name: string | null;
  recipient_email: string | null;
  communication_type: string;
  school_or_program: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  status: string;
  provider_message_id: string | null;
  failure_reason: string | null;
  initiated_by_email: string | null;
  initiated_at: string;
  delivered_at: string | null;
}

export const listStudentCommunicationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { studentId: string }) => {
    if (!data?.studentId) throw new Error("Missing studentId.");
    return data;
  })
  .handler(async ({ data, context }): Promise<CommunicationLogRow[]> => {
    const { data: rows, error } = await (context.supabase as any)
      .from("communication_logs")
      .select(
        "id, template_id, template_name, student_id, student_name, parent_name, recipient_email, communication_type, school_or_program, rendered_subject, rendered_body, status, provider_message_id, failure_reason, initiated_by_email, initiated_at, delivered_at",
      )
      .eq("student_id", data.studentId)
      .order("initiated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CommunicationLogRow[];
  });

export interface TemplateRow {
  id: string;
  template_name: string;
  communication_type: string;
  school_or_program: string;
  form_id: string | null;
  subject: string;
  email_body: string;
  active: boolean;
  eligibility_rules: Record<string, string | number | boolean | null>;
}

export const listCommunicationTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TemplateRow[]> => {
    const { data, error } = await (context.supabase as any)
      .from("communication_templates")
      .select(
        "id, template_name, communication_type, school_or_program, form_id, subject, email_body, active, eligibility_rules",
      )
      .eq("active", true)
      .order("template_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as TemplateRow[];
  });

export const listRecentCommunicationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommunicationLogRow[]> => {
    const { data, error } = await (context.supabase as any)
      .from("communication_logs")
      .select(
        "id, template_id, template_name, student_id, student_name, parent_name, recipient_email, communication_type, school_or_program, rendered_subject, rendered_body, status, provider_message_id, failure_reason, initiated_by_email, initiated_at, delivered_at",
      )
      .order("initiated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as CommunicationLogRow[];
  });
