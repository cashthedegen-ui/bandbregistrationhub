import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Send, FileDown, Eye, History, Save, X, Beaker } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  getCommunicationTemplate,
  updateCommunicationTemplate,
  listCommunicationTemplateVersions,
  sendTestCommunication,
  currentUserIsAdmin,
  type TemplateFull,
  type TemplateVersionRow,
} from "@/lib/communications/template-admin.functions";
import {
  buildLetterVariables,
  renderLetterHtml,
  SAMPLE_LETTER_VARIABLES,
  type LetterVariables,
} from "@/lib/communications/letter-renderer";
import { buildLetterPdf, downloadLetterPdf, openLetterPdfInNewTab } from "@/lib/communications/letter-pdf";
import { useStore } from "@/lib/store";
import type { StudentRow } from "@/lib/types";

export const Route = createFileRoute("/_app/communications/templates/$templateId")({
  head: () => ({ meta: [{ title: "Template Details — Communications" }] }),
  component: TemplateDetailsPage,
});

const VARIABLES = [
  { key: "student_name", desc: "Primary student name (Driver Name for form 6503623)" },
  { key: "parent_name", desc: "Parent / purchaser name" },
  { key: "amount_paid", desc: "Formatted USD amount (e.g. $1,437.00)" },
  { key: "payment_date", desc: "Date the confirmation is issued" },
  { key: "school_year", desc: "2026–2027 (fixed)" },
];

function substituteSubject(subject: string, vars: LetterVariables): string {
  const map: Record<string, string> = {
    student_name: vars.student_name,
    parent_name: vars.parent_name,
    amount_paid: vars.amount_paid,
    payment_date: vars.payment_date,
    school_year: vars.school_year,
  };
  return subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => map[k] ?? `{{${k}}}`);
}

function TemplateDetailsPage() {
  const { templateId } = Route.useParams();
  const getTpl = useServerFn(getCommunicationTemplate);
  const updateTpl = useServerFn(updateCommunicationTemplate);
  const listVersions = useServerFn(listCommunicationTemplateVersions);
  const sendTest = useServerFn(sendTestCommunication);
  const isAdminFn = useServerFn(currentUserIsAdmin);

  const [tpl, setTpl] = useState<TemplateFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ template_name: "", subject: "", email_body: "" });

  const [versions, setVersions] = useState<TemplateVersionRow[] | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const [previewMode, setPreviewMode] = useState<"sample" | "student">("sample");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const { students } = useStore();

  const eligibleStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          tpl?.form_id
            ? String(s.formId) === String(tpl.form_id)
            : true,
      ),
    [students, tpl?.form_id],
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([getTpl({ data: { id: templateId } }), isAdminFn()])
      .then(([t, admin]) => {
        setTpl(t);
        setDraft({ template_name: t.template_name, subject: t.subject, email_body: t.email_body });
        setIsAdmin(admin);
      })
      .catch((e) => toast.error(`Failed to load template: ${e?.message || e}`))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const previewStudent: StudentRow | null = useMemo(
    () => eligibleStudents.find((s) => s.id === selectedStudentId) || null,
    [eligibleStudents, selectedStudentId],
  );

  const activeVars: LetterVariables = useMemo(() => {
    if (previewMode === "student" && previewStudent) {
      const paidAmount =
        previewStudent.paymentType === "Financial Aid"
          ? previewStudent.familyPaid ?? 0
          : previewStudent.amountPaid ?? 0;
      return buildLetterVariables({
        studentName: previewStudent.studentName,
        parentName: previewStudent.parentName,
        amountPaid: paidAmount,
        paymentDate: new Date(),
        schoolYear: "2026–2027",
      });
    }
    return SAMPLE_LETTER_VARIABLES;
  }, [previewMode, previewStudent]);

  const rendered = useMemo(() => {
    const body = editing ? draft.email_body : tpl?.email_body || "";
    const subj = editing ? draft.subject : tpl?.subject || "";
    const { html, missing } = renderLetterHtml({ templateBodyHtml: body, vars: activeVars });
    return { subject: substituteSubject(subj, activeVars), html, missing };
  }, [editing, draft, tpl, activeVars]);

  const handleSave = async () => {
    if (!tpl) return;
    setSaving(true);
    try {
      const updated = await updateTpl({ data: { id: tpl.id, ...draft } });
      setTpl(updated);
      setDraft({
        template_name: updated.template_name,
        subject: updated.subject,
        email_body: updated.email_body,
      });
      setEditing(false);
      setVersions(null); // refetch next open
      toast.success("Template saved. Previous version stored in history.");
    } catch (e: any) {
      toast.error(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const openVersions = () => {
    setVersionsOpen(true);
    if (!versions) {
      listVersions({ data: { id: templateId } })
        .then(setVersions)
        .catch((e) => toast.error(e?.message || "Failed to load versions."));
    }
  };

  const handleSendTest = async () => {
    if (!tpl) return;
    setTestSending(true);
    try {
      const res = await sendTest({
        data: {
          templateId: tpl.id,
          testEmail: testEmail.trim(),
          renderedSubject: rendered.subject,
          renderedBody: rendered.html,
        },
      });
      if (res.ok) {
        toast.success(`Test email queued to ${testEmail}`);
        setTestOpen(false);
      } else {
        toast.error(res.message || "Test send failed.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Test send failed.");
    } finally {
      setTestSending(false);
    }
  };

  const currentBody = editing ? draft.email_body : tpl?.email_body || "";

  return (
    <div className="space-y-6">
      <div>
        <Link to="/communications" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Communications
        </Link>
      </div>

      <PageHeader
        title={tpl?.template_name || "Template"}
        subtitle={
          tpl
            ? `${tpl.communication_type} · ${tpl.school_or_program}${tpl.form_id ? ` · form ${tpl.form_id}` : ""}`
            : "Loading…"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openLetterPdfInNewTab(currentBody, activeVars)} disabled={!tpl}>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> View PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => tpl && downloadLetterPdf(currentBody, activeVars, activeVars.student_name || "sample")}
              disabled={!tpl}
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={openVersions} disabled={!tpl || !isAdmin} title={!isAdmin ? "Admins only" : ""}>
              <History className="h-3.5 w-3.5 mr-1.5" /> Version History
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTestOpen(true)}
              disabled={!tpl || !isAdmin}
              title={!isAdmin ? "Admins only" : ""}
            >
              <Beaker className="h-3.5 w-3.5 mr-1.5" /> Send Test
            </Button>
            {!editing ? (
              <Button
                size="sm"
                onClick={() => setEditing(true)}
                disabled={!tpl || !isAdmin}
                title={!isAdmin ? "Admins only" : ""}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Template
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => {
                  if (!tpl) return;
                  setDraft({ template_name: tpl.template_name, subject: tpl.subject, email_body: tpl.email_body });
                  setEditing(false);
                }}>
                  <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save Version
                </Button>
              </>
            )}
          </div>
        }
      />

      {loading || !tpl ? (
        <Card className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading template…
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* Left column: metadata + editor */}
          <div className="space-y-4">
            <Card className="p-4 bg-card border-border space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
                {editing ? (
                  <Input
                    className="mt-1"
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">{tpl.subject}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Template Name</div>
                {editing ? (
                  <Input
                    className="mt-1"
                    value={draft.template_name}
                    onChange={(e) => setDraft({ ...draft, template_name: e.target.value })}
                  />
                ) : (
                  <div className="text-sm mt-1">{tpl.template_name}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</div>
                  <div>{tpl.communication_type}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Form ID</div>
                  <div>{tpl.form_id || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</div>
                  <div>{tpl.active ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</div>
                  <div>{new Date(tpl.updated_at).toLocaleString()}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Variables Used</div>
              <div className="space-y-1.5 text-xs">
                {VARIABLES.map((v) => (
                  <div key={v.key} className="flex items-start gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{`{{${v.key}}}`}</Badge>
                    <span className="text-muted-foreground">{v.desc}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview Data</div>
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant={previewMode === "sample" ? "default" : "secondary"}
                  onClick={() => setPreviewMode("sample")}
                >
                  Sample
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "student" ? "default" : "secondary"}
                  onClick={() => setPreviewMode("student")}
                >
                  Real Student
                </Button>
              </div>
              {previewMode === "student" && (
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder={`Pick a student (${eligibleStudents.length} available)`} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {eligibleStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.studentName} — {s.parentName} ({s.paymentStatus})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {previewMode === "student" && !previewStudent && (
                <div className="text-[11px] text-muted-foreground mt-2">
                  Select a student to render the letter with their live data. Preview only — nothing is sent.
                </div>
              )}
            </Card>

            {editing && (
              <Card className="p-4 bg-card border-border">
                <Label className="text-xs">Email Body (HTML)</Label>
                <Textarea
                  className="font-mono text-xs mt-1 min-h-[240px]"
                  value={draft.email_body}
                  onChange={(e) => setDraft({ ...draft, email_body: e.target.value })}
                />
                <div className="text-[10px] text-muted-foreground mt-2">
                  Only the body content is editable. The B&amp;B logo, header, school-year band,
                  title, and footer are locked to protect brand consistency.
                </div>
              </Card>
            )}
          </div>

          {/* Right column: full letter preview */}
          <Card className="p-4 bg-neutral-200 border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-neutral-600">
                Full Letter Preview
              </div>
              <div className="text-[10px] text-neutral-600">Subject: <span className="font-medium">{rendered.subject}</span></div>
            </div>
            {rendered.missing.length > 0 && (
              <div className="mb-2 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[11px] p-2">
                Missing variables: {rendered.missing.join(", ")}
              </div>
            )}
            <div className="overflow-auto max-h-[75vh] rounded">
              <div style={{ transform: "scale(0.72)", transformOrigin: "top left", width: "139%" }}>
                <div
                  className="bg-white shadow-lg"
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Send Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Beaker className="h-4 w-4" /> Send Test Copy</DialogTitle>
            <DialogDescription>
              A test email will be delivered to the address below. Test sends do NOT create
              production history, do NOT change payment status, and do NOT mark any student as confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Test recipient</Label>
            <Input
              type="email"
              placeholder="you@bandbtrans.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <div className="text-[11px] text-muted-foreground">
              The letter uses the currently visible preview data ({previewMode === "sample" ? "sample" : previewStudent?.studentName || "no student selected"}).
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTestOpen(false)} disabled={testSending}>Cancel</Button>
            <Button onClick={handleSendTest} disabled={testSending || !testEmail}>
              {testSending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Version History</DialogTitle>
            <DialogDescription>Every prior version of this template, most recent first.</DialogDescription>
          </DialogHeader>
          {!versions ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4">
              No prior versions yet. The next time this template is edited, the current version
              will be archived here automatically.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <details key={v.id} className="rounded border border-border bg-background/60 p-2 text-xs">
                  <summary className="cursor-pointer flex items-center justify-between">
                    <span className="font-medium">v{v.version_number} — {v.template_name}</span>
                    <span className="text-muted-foreground">
                      {new Date(v.saved_at).toLocaleString()}
                      {v.saved_by_email ? ` · ${v.saved_by_email}` : ""}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Subject</div>
                      <div>{v.subject}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Body HTML</div>
                      <pre className="whitespace-pre-wrap font-mono text-[10px] bg-background/40 p-2 rounded border border-border/50">{v.email_body}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
