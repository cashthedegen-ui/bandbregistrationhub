import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MailCheck, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import type { StudentRow } from "@/lib/types";
import {
  listCommunicationTemplates,
  sendCommunication,
  type TemplateRow,
} from "@/lib/communications/communications.functions";

// Client-side eligibility check — mirrors the server-side validation so
// staff never see a Send button that will just error out on submit.
export function pickTemplateForStudent(
  templates: TemplateRow[],
  student: StudentRow,
  communicationType = "Payment Confirmation",
): TemplateRow | null {
  return (
    templates.find(
      (t) =>
        t.active &&
        t.communication_type === communicationType &&
        (t.form_id ? String(t.form_id) === String(student.formId) : false),
    ) || null
  );
}

export function isConfirmationEligible(student: StudentRow, template: TemplateRow | null): {
  ok: boolean;
  reason?: string;
} {
  if (!template) return { ok: false, reason: "No approved template for this program." };
  const rules = (template.eligibility_rules || {}) as Record<string, unknown>;
  if (rules.require_payment_received && student.paymentStatus !== "Received") {
    return {
      ok: false,
      reason: "Payment must be marked as received before this confirmation can be sent.",
    };
  }
  if (rules.require_parent_email && !student.parentEmail) {
    return { ok: false, reason: "Parent email is missing for this student." };
  }
  return { ok: true };
}

export function CommunicationPreviewModal({
  student,
  open,
  onClose,
  onSent,
}: {
  student: StudentRow | null;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const listTemplates = useServerFn(listCommunicationTemplates);
  const send = useServerFn(sendCommunication);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [forceResend, setForceResend] = useState(false);
  const [alreadySentAt, setAlreadySentAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForceResend(false);
    setAlreadySentAt(null);
    setLoading(true);
    listTemplates()
      .then((rows) => setTemplates(rows))
      .catch((e) => toast.error(`Failed to load templates: ${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [open, listTemplates]);

  const template = useMemo(
    () => (student && templates ? pickTemplateForStudent(templates, student) : null),
    [templates, student],
  );

  const eligibility = useMemo(
    () => (student ? isConfirmationEligible(student, template) : { ok: false }),
    [student, template],
  );

  // Preview using the same variable substitution the server will do
  const preview = useMemo(() => {
    if (!template || !student) return null;
    const currency = (n: number | undefined | null) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));
    const paidAmount =
      student.paymentType === "Financial Aid" ? student.familyPaid ?? 0 : student.amountPaid ?? 0;
    const remaining =
      student.paymentType === "Financial Aid"
        ? Math.max(0, student.schoolOwes ?? 0)
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
      remaining_balance: currency(remaining),
      registration_date: student.submissionDate
        ? new Date(student.submissionDate).toLocaleDateString()
        : "",
      school_year: "2026 – 2027",
      due_date: "",
      payment_link: "",
    };
    const missing: string[] = [];
    const substitute = (s: string) =>
      s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => {
        const v = vars[k];
        if (!v && !["due_date", "payment_link"].includes(k)) {
          if (!missing.includes(k)) missing.push(k);
        }
        return v || `{{${k}}}`;
      });
    return {
      subject: substitute(template.subject),
      body: substitute(template.email_body),
      missing,
    };
  }, [template, student]);

  const handleSend = async () => {
    if (!student || !template) return;
    setSending(true);
    try {
      const result = await send({
        data: {
          templateId: template.id,
          force: forceResend,
          student: {
            id: student.id,
            submissionId: student.submissionId,
            formId: student.formId,
            schoolName: student.schoolName,
            studentName: student.studentName,
            grade: student.grade,
            parentName: student.parentName,
            parentEmail: student.parentEmail,
            parentPhone: student.parentPhone,
            submissionDate: student.submissionDate,
            paymentStatus: student.paymentStatus,
            paymentType: student.paymentType,
            amountPaid: student.amountPaid,
            familyPaid: student.familyPaid,
            schoolOwes: student.schoolOwes,
            rtAmount: student.rtAmount,
            owAmount: student.owAmount,
          },
        },
      });
      if (result.ok) {
        toast.success(`Confirmation sent to ${student.parentEmail}`);
        onSent?.();
        onClose();
      } else {
        toast.error(result.message || `Send failed (status: ${result.status})`);
        onSent?.();
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Duplicate-send detection: the server throws an Error with the
      // previous send date in the message.
      const dupMatch = /already sent on (.+)\./i.exec(msg);
      if (dupMatch) {
        setAlreadySentAt(dupMatch[1]);
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  };

  if (!student) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-emerald-400" /> Send Confirmation
          </DialogTitle>
          <DialogDescription>
            Review the personalized email below. Nothing is sent until you click Send Confirmation.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading template…
          </div>
        ) : !template ? (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            No approved confirmation template is configured for this program yet.
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded border border-border bg-background/60 p-3 text-xs">
              <Field label="Student" value={student.studentName} />
              <Field label="Grade" value={student.grade || "—"} />
              <Field label="Parent" value={student.parentName || "—"} />
              <Field label="Recipient" value={student.parentEmail || "—"} />
              <Field label="School / Program" value={student.schoolName} />
              <Field
                label="Payment"
                value={`${student.paymentStatus} · ${student.paymentType || ""}`}
              />
              <Field label="Amount Paid" value={fmtMoney(student.amountPaid ?? student.familyPaid ?? 0)} />
              <Field label="Template" value={template.template_name} />
            </div>

            {!eligibility.ok && (
              <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{eligibility.reason}</span>
              </div>
            )}

            {preview?.missing && preview.missing.length > 0 && (
              <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Missing data: {preview.missing.join(", ")}. Fill these on the student record
                  before sending.
                </span>
              </div>
            )}

            {alreadySentAt && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div>This confirmation was already sent on {alreadySentAt}.</div>
                    <label className="flex items-center gap-2 text-amber-100">
                      <input
                        type="checkbox"
                        checked={forceResend}
                        onChange={(e) => setForceResend(e.target.checked)}
                      />
                      Yes, resend intentionally.
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Subject
              </div>
              <div className="rounded border border-border bg-background/60 p-2 text-sm font-medium">
                {preview?.subject}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Email Body
              </div>
              <div
                className="rounded border border-border bg-background/60 p-3 text-sm prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: preview?.body || "" }}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              !template ||
              !eligibility.ok ||
              !!(preview?.missing && preview.missing.length > 0) ||
              (!!alreadySentAt && !forceResend)
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" /> Send Confirmation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate" title={value}>
        {value || "—"}
      </div>
    </div>
  );
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Small status badge helper for history entries.
export function CommunicationStatusBadge({ status }: { status: string }) {
  const cls =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : status === "failed"
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : status === "processing"
      ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}
