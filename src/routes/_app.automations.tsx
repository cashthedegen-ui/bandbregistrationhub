import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchTemplates, saveTemplate, fetchContacts, saveContact, deleteContact,
  fetchHistory, fetchConfigs, saveConfig,
  type EmailTemplate, type SchoolContact, type EmailHistoryRow, type AutomationConfig,
} from "@/lib/automations";
import { sendAutomationEmail } from "@/lib/email/automation.functions";
import { useStore } from "@/lib/store";
import { logAudit } from "@/lib/audit-log";
import { toast } from "sonner";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail, Send, Save, Eye, Loader2, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, Search, Users, School as SchoolIcon,
} from "lucide-react";

export const Route = createFileRoute("/_app/automations")({
  head: () => ({ meta: [{ title: "Automations — B & B Transit" }] }),
  component: AutomationsPage,
});

const PARENT_KEYS = ["confirmation_letter", "receipt", "payment_reminder"] as const;
const RUN_SHEET_KEY = "run_sheet";
const SCHOOL_KEY = "school_summary";

function parseList(s: string): string[] {
  return s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

function AutomationsPage() {
  const { students, settings } = useStore();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [configs, setConfigs] = useState<AutomationConfig[]>([]);
  const [contacts, setContacts] = useState<SchoolContact[]>([]);
  const [history, setHistory] = useState<EmailHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadAll = async () => {
    try {
      const [t, c, ct, h] = await Promise.all([fetchTemplates(), fetchConfigs(), fetchContacts(), fetchHistory({ limit: 200 })]);
      setTemplates(t);
      setConfigs(c);
      setContacts(ct);
      setHistory(h);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load automation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reloadAll(); }, []);

  const templateMap = useMemo(() => Object.fromEntries(templates.map((t) => [t.key, t])), [templates]);
  const configMap = useMemo(() => Object.fromEntries(configs.map((c) => [c.key, c])), [configs]);

  // Status metrics
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const sentToday = history.filter((h) => h.sent_at >= startOfDay && h.status === "sent").length;
  const sentMonth = history.filter((h) => h.sent_at >= startOfMonth && h.status === "sent").length;
  const failures = history.filter((h) => h.status === "failed").length;
  const lastSent = history.find((h) => h.status === "sent");
  const lastFailed = history.find((h) => h.status === "failed");
  const activeCount = configs.filter((c) => c.enabled).length;
  const disabledCount = configs.filter((c) => !c.enabled).length;

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Parent and school communication, with optional driver tools"
        actions={
          <Button variant="outline" size="sm" onClick={() => void reloadAll()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatusCard label="Active automations" value={formatNumber(activeCount)} accent="text-green-500" />
        <StatusCard label="Disabled" value={formatNumber(disabledCount)} accent="text-muted-foreground" />
        <StatusCard label="Sent today" value={formatNumber(sentToday)} />
        <StatusCard label="Sent this month" value={formatNumber(sentMonth)} />
        <StatusCard label="Failures" value={formatNumber(failures)} accent={failures > 0 ? "text-red-500" : "text-muted-foreground"} />
        <StatusCard label="Last sent" value={lastSent ? new Date(lastSent.sent_at).toLocaleString() : "—"} small />
        <StatusCard label="Last failure" value={lastFailed ? new Date(lastFailed.sent_at).toLocaleString() : "—"} small accent={lastFailed ? "text-red-500" : undefined} />
        <StatusCard label="Templates" value={formatNumber(templates.length)} />
      </div>

      <Tabs defaultValue="parent">
        <TabsList className="mb-4">
          <TabsTrigger value="parent">Parent communication</TabsTrigger>
          <TabsTrigger value="school">School contacts</TabsTrigger>
          <TabsTrigger value="history">Email history</TabsTrigger>
          <TabsTrigger value="driver">Driver (optional)</TabsTrigger>
        </TabsList>

        <TabsContent value="parent" className="space-y-4">
          {PARENT_KEYS.map((key) => {
            const t = templateMap[key];
            const c = configMap[key];
            if (!t) return null;
            return (
              <AutomationCard
                key={key}
                template={t}
                config={c}
                onSavedTemplate={(updated) => setTemplates((arr) => arr.map((x) => x.key === updated.key ? updated : x))}
                onSavedConfig={(updated) => setConfigs((arr) => {
                  const exists = arr.some((x) => x.key === updated.key);
                  return exists ? arr.map((x) => x.key === updated.key ? updated : x) : [...arr, updated];
                })}
                onSent={() => void reloadAll()}
                kind="parent"
                students={students}
                schoolYear={settings.receipt?.schoolYear ?? ""}
                extraAction={
                  key === "payment_reminder" ? (
                    <BulkPaymentReminderButton
                      template={t}
                      subject={t.subject}
                      bodyHtml={t.body_html}
                      students={students}
                      schoolYear={settings.receipt?.schoolYear ?? ""}
                      onSent={() => void reloadAll()}
                    />
                  ) : null
                }
              />
            );
          })}
        </TabsContent>

        <TabsContent value="school" className="space-y-4">
          <SchoolContactsSection
            contacts={contacts}
            onChanged={async () => { setContacts(await fetchContacts()); }}
          />
          {templateMap[SCHOOL_KEY] && (
            <AutomationCard
              template={templateMap[SCHOOL_KEY]}
              config={configMap[SCHOOL_KEY]}
              onSavedTemplate={(updated) => setTemplates((arr) => arr.map((x) => x.key === updated.key ? updated : x))}
              onSavedConfig={(updated) => setConfigs((arr) => {
                const exists = arr.some((x) => x.key === updated.key);
                return exists ? arr.map((x) => x.key === updated.key ? updated : x) : [...arr, updated];
              })}
              onSent={() => void reloadAll()}
              kind="school"
              students={students}
              contacts={contacts}
              schoolYear={settings.receipt?.schoolYear ?? ""}
              extraAction={
                <BulkSchoolUpdateButton
                  template={templateMap[SCHOOL_KEY]}
                  subject={templateMap[SCHOOL_KEY].subject}
                  bodyHtml={templateMap[SCHOOL_KEY].body_html}
                  contacts={contacts}
                  students={students}
                  onSent={() => void reloadAll()}
                />
              }
            />
          )}
        </TabsContent>

        <TabsContent value="history">
          <HistorySection history={history} templates={templates} onRefresh={reloadAll} />
        </TabsContent>

        <TabsContent value="driver" className="space-y-4">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Driver email is optional. Use the dedicated <a href="/run-sheets" className="text-primary underline">Run Sheets</a> page
              for the full run-sheet workflow (build PDF, preview, multi-recipient send). The template and schedule below are
              available for ad-hoc driver notifications.
            </CardContent>
          </Card>
          {templateMap[RUN_SHEET_KEY] && (
            <AutomationCard
              template={templateMap[RUN_SHEET_KEY]}
              config={configMap[RUN_SHEET_KEY]}
              onSavedTemplate={(updated) => setTemplates((arr) => arr.map((x) => x.key === updated.key ? updated : x))}
              onSavedConfig={(updated) => setConfigs((arr) => {
                const exists = arr.some((x) => x.key === updated.key);
                return exists ? arr.map((x) => x.key === updated.key ? updated : x) : [...arr, updated];
              })}
              onSent={() => void reloadAll()}
              kind="runsheet"
              students={students}
              schoolYear={settings.receipt?.schoolYear ?? ""}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusCard({ label, value, accent, small }: { label: string; value: string; accent?: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 font-semibold ${small ? "text-sm" : "text-2xl"} ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/* -------------------- Automation Card -------------------- */

interface AutomationCardProps {
  template: EmailTemplate;
  config: AutomationConfig | undefined;
  onSavedTemplate: (t: EmailTemplate) => void;
  onSavedConfig: (c: AutomationConfig) => void;
  onSent: () => void;
  kind: "parent" | "runsheet" | "school";
  students: ReturnType<typeof useStore>["students"];
  contacts?: SchoolContact[];
  schoolYear?: string;
  extraAction?: ReactNode;
}

function AutomationCard({ template, config, onSavedTemplate, onSavedConfig, onSent, kind, students, contacts, schoolYear, extraAction }: AutomationCardProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [savingTpl, setSavingTpl] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cfgJson, setCfgJson] = useState(JSON.stringify(config?.config ?? {}, null, 2));
  const [savingCfg, setSavingCfg] = useState(false);

  useEffect(() => { setEnabled(config?.enabled ?? false); setCfgJson(JSON.stringify(config?.config ?? {}, null, 2)); }, [config]);
  useEffect(() => { setSubject(template.subject); setBodyHtml(template.body_html); }, [template]);

  const handleSaveTemplate = async () => {
    setSavingTpl(true);
    try {
      await saveTemplate({ ...template, subject, body_html: bodyHtml });
      onSavedTemplate({ ...template, subject, body_html: bodyHtml, updated_at: new Date().toISOString() });
      void logAudit({ action: `updated email template "${template.name}"`, entityType: "email_template", entityId: template.key, entityName: template.name });
      toast.success("Template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save template");
    } finally { setSavingTpl(false); }
  };

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    try {
      let cfg: Record<string, unknown> = {};
      try { cfg = JSON.parse(cfgJson); } catch { cfg = config?.config ?? {}; }
      await saveConfig(template.key, next, cfg);
      onSavedConfig({ key: template.key, enabled: next, config: cfg, updated_at: new Date().toISOString() });
      void logAudit({ action: `${next ? "enabled" : "disabled"} automation "${template.name}"`, entityType: "automation", entityId: template.key, entityName: template.name });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
      setEnabled(!next);
    }
  };

  const handleSaveConfig = async () => {
    setSavingCfg(true);
    try {
      let cfg: Record<string, unknown>;
      try { cfg = JSON.parse(cfgJson); }
      catch { toast.error("Schedule config is not valid JSON"); setSavingCfg(false); return; }
      await saveConfig(template.key, enabled, cfg);
      onSavedConfig({ key: template.key, enabled, config: cfg, updated_at: new Date().toISOString() });
      toast.success("Schedule saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setSavingCfg(false); }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{template.name}</h3>
              <Badge variant={enabled ? "default" : "outline"} className={enabled ? "bg-green-600 hover:bg-green-600" : ""}>
                {enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            {template.description && <p className="text-xs text-muted-foreground mt-1">{template.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enable-${template.key}`} className="text-xs">Enabled</Label>
            <Switch id={`enable-${template.key}`} checked={enabled} onCheckedChange={handleToggle} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Email subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Label className="text-xs">Email body (HTML — use {"{{variable}}"} placeholders)</Label>
            <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={8} className="font-mono text-xs" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveTemplate} disabled={savingTpl}>
                {savingTpl ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}>
                <Send className="h-3.5 w-3.5 mr-1.5" /> Send manually
              </Button>
              {extraAction}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Schedule / trigger settings (JSON)</Label>
            <Textarea value={cfgJson} onChange={(e) => setCfgJson(e.target.value)} rows={8} className="font-mono text-xs" />
            <Button size="sm" variant="secondary" onClick={handleSaveConfig} disabled={savingCfg}>
              {savingCfg ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save schedule
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Schedules are stored now and used when scheduled-send is enabled in a future release. Manual send works today.
            </p>
          </div>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{template.name} — preview</DialogTitle></DialogHeader>
            <div className="text-xs text-muted-foreground mb-1">Subject</div>
            <div className="text-sm font-medium border rounded p-2 mb-3">{subject}</div>
            <div className="text-xs text-muted-foreground mb-1">Body (rendered)</div>
            <div className="border rounded p-3 max-h-[60vh] overflow-auto bg-white text-black" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </DialogContent>
        </Dialog>

        <SendDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          template={template}
          subject={subject}
          bodyHtml={bodyHtml}
          kind={kind}
          students={students}
          contacts={contacts}
          onSent={() => { setSendOpen(false); onSent(); }}
        />
      </CardContent>
    </Card>
  );
}

/* -------------------- Send Dialog -------------------- */

function SendDialog({
  open, onOpenChange, template, subject, bodyHtml, kind, students, contacts, onSent,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  template: EmailTemplate;
  subject: string;
  bodyHtml: string;
  kind: "parent" | "runsheet" | "school";
  students: ReturnType<typeof useStore>["students"];
  contacts?: SchoolContact[];
  onSent: () => void;
}) {
  const send = useServerFn(sendAutomationEmail);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [studentId, setStudentId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [customVars, setCustomVars] = useState<string>("{}");

  useEffect(() => {
    if (!open) return;
    setTo(""); setCc(""); setBcc(""); setStudentId(""); setContactId(""); setCustomVars("{}");
  }, [open, template.key]);

  // Auto-fill from chosen student
  useEffect(() => {
    if (!studentId) return;
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    if (s.parentEmail) setTo(s.parentEmail);
    const total = s.rtAmount ?? s.owAmount ?? 0;
    const paid = s.amountPaid ?? 0;
    const balance = Math.max(0, total - paid);
    const vars = {
      studentName: s.studentName,
      parentName: s.parentName,
      schoolName: s.schoolName,
      grade: s.grade,
      schoolYear: "",
      paymentDate: new Date().toLocaleDateString(),
      amountPaid: paid.toFixed(2),
      balanceDue: balance.toFixed(2),
      paymentStatus: s.paymentStatus,
      checkLine: s.checkNumber ? `<tr><td style="color:#57534e;">Check #</td><td><strong>${s.checkNumber}</strong></td></tr>` : "",
      stopAddress: s.stopAddress,
    };
    setCustomVars(JSON.stringify(vars, null, 2));
  }, [studentId, students]);

  useEffect(() => {
    if (!contactId || !contacts) return;
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    if (c.email) setTo(c.email);
    const schoolStudents = students.filter((s) => s.schoolName === c.school_name);
    const vars = {
      contactName: c.contact_name,
      schoolName: c.school_name,
      activeCount: schoolStudents.length,
      amCount: schoolStudents.length,
      pmCount: schoolStudents.length,
      newCount: schoolStudents.filter((s) => s.status === "New").length,
      droppedCount: 0,
      pendingCount: schoolStudents.filter((s) => s.status === "New").length,
      periodLabel: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
    setCustomVars(JSON.stringify(vars, null, 2));
  }, [contactId, contacts, students]);

  const handleSend = async () => {
    setSending(true);
    try {
      let vars: Record<string, string | number> = {};
      try { vars = JSON.parse(customVars); } catch { toast.error("Variables JSON is invalid"); setSending(false); return; }
      const result = await send({
        data: {
          templateKey: template.key,
          to: parseList(to),
          cc: parseList(cc),
          bcc: parseList(bcc),
          subject,
          bodyHtml,
          variables: vars,
          metadata: { manual: true, studentId, contactId },
        },
      });
      void logAudit({
        action: `sent automation email "${template.name}"`,
        entityType: "email",
        entityId: result.id,
        entityName: template.name,
        details: { to: parseList(to), template: template.key },
      });
      toast.success(`Sent (${result.id})`);
      onSent();
    } catch (e: any) {
      toast.error(e?.message || "Send failed");
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Send: {template.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {kind === "parent" && (
            <div>
              <Label className="text-xs">Pick a student (auto-fills recipient + variables)</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student…" /></SelectTrigger>
                <SelectContent>
                  {students.slice(0, 200).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.studentName} — {s.parentEmail || "(no email)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "school" && contacts && (
            <div>
              <Label className="text-xs">Pick a school contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Select contact…" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.school_name} — {c.contact_name || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="alice@example.com, bob@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cc</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Bcc</Label>
              <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Template variables (JSON)</Label>
            <Textarea value={customVars} onChange={(e) => setCustomVars(e.target.value)} rows={6} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- School Contacts -------------------- */

function SchoolContactsSection({ contacts, onChanged }: { contacts: SchoolContact[]; onChanged: () => Promise<void> }) {
  const { students } = useStore();
  const schools = useMemo(() => {
    const s = new Set<string>();
    students.forEach((x) => x.schoolName && s.add(x.schoolName));
    contacts.forEach((c) => s.add(c.school_name));
    return Array.from(s).sort();
  }, [students, contacts]);

  const [editing, setEditing] = useState<SchoolContact | null>(null);
  const [open, setOpen] = useState(false);
  const blank = (): SchoolContact => ({ id: "", school_name: schools[0] ?? "", contact_name: "", title: "", email: "", phone: "", notes: "" });

  const startNew = () => { setEditing(blank()); setOpen(true); };
  const startEdit = (c: SchoolContact) => { setEditing({ ...c }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    if (!editing.school_name) { toast.error("School is required"); return; }
    try {
      await saveContact(editing);
      await onChanged();
      void logAudit({ action: `saved school contact for ${editing.school_name}`, entityType: "school_contact", entityName: editing.contact_name });
      toast.success("Contact saved");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  };

  const remove = async (c: SchoolContact) => {
    if (!confirm(`Delete contact ${c.contact_name || c.email}?`)) return;
    try {
      await deleteContact(c.id);
      await onChanged();
      toast.success("Deleted");
    } catch (e: any) { toast.error(e?.message || "Failed to delete"); }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">School contacts</h3>
          <Button size="sm" onClick={startNew}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add contact</Button>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet. Add one to enable school summary emails.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.school_name}</TableCell>
                  <TableCell>{c.contact_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.title}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(c)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?.id ? "Edit contact" : "New contact"}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">School</Label>
                  <Select value={editing.school_name} onValueChange={(v) => setEditing({ ...editing, school_name: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Name</Label><Input value={editing.contact_name} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></div>
                  <div><Label className="text-xs">Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Email</Label><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* -------------------- Email History -------------------- */

function HistorySection({ history, templates, onRefresh }: { history: EmailHistoryRow[]; templates: EmailTemplate[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [template, setTemplate] = useState("all");

  const filtered = useMemo(() => {
    return history.filter((h) => {
      if (status !== "all" && h.status !== status) return false;
      if (template !== "all" && h.template_key !== template) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!h.recipient.toLowerCase().includes(q) && !h.subject.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [history, search, status, template]);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7" placeholder="Recipient or subject…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={() => void onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">{formatNumber(filtered.length)} of {formatNumber(history.length)} records</div>

        <div className="overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Sent by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(h.sent_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{h.template_key || "—"}</TableCell>
                  <TableCell className="text-xs">{h.recipient}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate" title={h.subject}>{h.subject}</TableCell>
                  <TableCell className="text-xs">{h.sent_by_name || h.sent_by_email || "—"}</TableCell>
                  <TableCell>
                    {h.status === "sent" ? (
                      <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Sent</Badge>
                    ) : (
                      <Badge variant="destructive" title={h.error || ""}><AlertCircle className="h-3 w-3 mr-1" /> Failed</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No emails match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- Bulk Payment Reminders -------------------- */

type Student = ReturnType<typeof useStore>["students"][number];

function studentBalance(s: Student): number {
  const total = s.rtAmount ?? s.owAmount ?? 0;
  const paid = s.amountPaid ?? 0;
  return Math.max(0, total - paid);
}

function BulkPaymentReminderButton({
  template, subject, bodyHtml, students, schoolYear, onSent,
}: {
  template: EmailTemplate;
  subject: string;
  bodyHtml: string;
  students: Student[];
  schoolYear: string;
  onSent: () => void;
}) {
  const send = useServerFn(sendAutomationEmail);
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("Pending");
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const schools = useMemo(() => Array.from(new Set(students.map((s) => s.schoolName).filter(Boolean))).sort(), [students]);

  const candidates = useMemo(() => {
    return students.filter((s) => {
      if (!s.parentEmail) return false;
      if (school !== "all" && s.schoolName !== school) return false;
      if (paymentStatus !== "all" && s.paymentStatus !== paymentStatus) return false;
      if (unpaidOnly && studentBalance(s) <= 0) return false;
      return true;
    });
  }, [students, school, paymentStatus, unpaidOnly]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map((s) => s.id)));
  }, [open, candidates]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkSend = async () => {
    const list = candidates.filter((s) => selected.has(s.id));
    if (list.length === 0) { toast.error("No recipients selected"); return; }
    if (!confirm(`Send payment reminders to ${list.length} parent(s)?`)) return;
    setSending(true);
    let ok = 0, fail = 0;
    for (const s of list) {
      const balance = studentBalance(s);
      const vars = {
        studentName: s.studentName,
        parentName: s.parentName,
        schoolName: s.schoolName,
        schoolYear,
        balanceDue: balance.toFixed(2),
        paymentStatus: s.paymentStatus,
      };
      try {
        await send({
          data: {
            templateKey: template.key,
            to: [s.parentEmail],
            cc: [], bcc: [],
            subject, bodyHtml,
            variables: vars,
            metadata: { bulk: true, studentId: s.id, school: s.schoolName },
          },
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSending(false);
    void logAudit({
      action: `sent bulk payment reminders (${ok} ok / ${fail} failed)`,
      entityType: "email",
      entityName: template.name,
      details: { ok, fail, filter: { school, paymentStatus } },
    });
    toast[fail ? "warning" : "success"](`Sent ${ok} reminder${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}`);
    setOpen(false);
    onSent();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Users className="h-3.5 w-3.5 mr-1.5" /> Bulk send
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bulk payment reminders</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">School</Label>
              <Select value={school} onValueChange={setSchool}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All schools</SelectItem>
                  {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Payment status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                  <SelectItem value="Received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Checkbox id="unpaid" checked={unpaidOnly} onCheckedChange={(v) => setUnpaidOnly(!!v)} />
              <Label htmlFor="unpaid" className="text-xs">Only with balance &gt; 0</Label>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatNumber(candidates.length)} matching parent{candidates.length === 1 ? "" : "s"} with email — {formatNumber(selected.size)} selected
          </div>
          <div className="border rounded max-h-[40vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Parent email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} /></TableCell>
                    <TableCell className="text-xs">{s.studentName}</TableCell>
                    <TableCell className="text-xs">{s.schoolName}</TableCell>
                    <TableCell className="text-xs">{s.parentEmail}</TableCell>
                    <TableCell className="text-xs">{s.paymentStatus}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(studentBalance(s))}</TableCell>
                  </TableRow>
                ))}
                {candidates.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No matching parents.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Reminders stop automatically once a student is marked paid. One email per selected parent.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleBulkSend} disabled={sending || selected.size === 0}>
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send {formatNumber(selected.size)} reminder{selected.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------- Bulk School Updates -------------------- */

function BulkSchoolUpdateButton({
  template, subject, bodyHtml, contacts, students, onSent,
}: {
  template: EmailTemplate;
  subject: string;
  bodyHtml: string;
  contacts: SchoolContact[];
  students: Student[];
  onSent: () => void;
}) {
  const send = useServerFn(sendAutomationEmail);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const eligible = useMemo(() => contacts.filter((c) => c.email), [contacts]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(eligible.map((c) => c.id)));
  }, [open, eligible]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkSend = async () => {
    const list = eligible.filter((c) => selected.has(c.id));
    if (list.length === 0) { toast.error("No contacts selected"); return; }
    if (!confirm(`Send school updates to ${list.length} contact(s)?`)) return;
    setSending(true);
    let ok = 0, fail = 0;
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    for (const c of list) {
      const schoolStudents = students.filter((s) => s.schoolName === c.school_name);
      const vars = {
        contactName: c.contact_name || "there",
        schoolName: c.school_name,
        routeLine: "",
        totalStudents: schoolStudents.length,
        amCount: schoolStudents.length,
        pmCount: schoolStudents.length,
        newCount: schoolStudents.filter((s) => s.status === "New").length,
        droppedCount: 0,
        pendingCount: schoolStudents.filter((s) => s.status === "New").length,
        notesBlock: c.notes ? `<p><strong>Notes:</strong> ${c.notes}</p>` : "",
        periodLabel: today,
      };
      try {
        await send({
          data: {
            templateKey: template.key,
            to: [c.email],
            cc: [], bcc: [],
            subject, bodyHtml,
            variables: vars,
            metadata: { bulk: true, contactId: c.id, school: c.school_name },
          },
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSending(false);
    void logAudit({
      action: `sent bulk school updates (${ok} ok / ${fail} failed)`,
      entityType: "email",
      entityName: template.name,
      details: { ok, fail },
    });
    toast[fail ? "warning" : "success"](`Sent ${ok} update${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}`);
    setOpen(false);
    onSent();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <SchoolIcon className="h-3.5 w-3.5 mr-1.5" /> Bulk send
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Send updates to school contacts</DialogTitle></DialogHeader>
          <div className="text-xs text-muted-foreground">
            {formatNumber(eligible.length)} contact{eligible.length === 1 ? "" : "s"} with email — {formatNumber(selected.size)} selected
          </div>
          <div className="border rounded max-h-[40vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((c) => {
                  const count = students.filter((s) => s.schoolName === c.school_name).length;
                  return (
                    <TableRow key={c.id}>
                      <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></TableCell>
                      <TableCell className="text-xs font-medium">{c.school_name}</TableCell>
                      <TableCell className="text-xs">{c.contact_name}</TableCell>
                      <TableCell className="text-xs">{c.email}</TableCell>
                      <TableCell className="text-xs text-right">{formatNumber(count)}</TableCell>
                    </TableRow>
                  );
                })}
                {eligible.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No school contacts with email yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleBulkSend} disabled={sending || selected.size === 0}>
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send {formatNumber(selected.size)} update{selected.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
