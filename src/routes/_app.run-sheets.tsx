import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import {
  buildRunSheet, downloadRunSheet, runSheetBase64, runSheetDataUri, runSheetFilename,
  type RunSheetOptions, type Session,
} from "@/lib/run-sheet";
import { sendRunSheetEmail } from "@/lib/email/run-sheet.functions";
import { logAudit } from "@/lib/audit-log";
import { Eye, Download, Mail, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/_app/run-sheets")({
  head: () => ({ meta: [{ title: "Run Sheets — B & B Transit" }] }),
  component: RunSheetsPage,
});

const ALL = "__all__";
const DRIVER_STORE_KEY = "bb.runsheet.drivers.v1";

interface DriverInfo {
  morningDriverName: string;
  afternoonDriverName: string;
  driverPhone: string;
  driverEmail: string;
  busNumber: string;
  vehicleNotes: string;
}

const EMPTY_DRIVER: DriverInfo = {
  morningDriverName: "",
  afternoonDriverName: "",
  driverPhone: "",
  driverEmail: "",
  busNumber: "",
  vehicleNotes: "",
};

function loadDriverMap(): Record<string, DriverInfo> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRIVER_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveDriverMap(map: Record<string, DriverInfo>) {
  try { window.localStorage.setItem(DRIVER_STORE_KEY, JSON.stringify(map)); } catch {}
}

function parseRecipients(v: string): string[] {
  return v.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function RunSheetsPage() {
  const { students } = useStore();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [school, setSchool] = useState<string>(ALL);
  const [date, setDate] = useState<string>(todayIso);
  const [route, setRoute] = useState<string>(ALL);
  const [session, setSession] = useState<Session>("Both");

  const [driver, setDriver] = useState<DriverInfo>(EMPTY_DRIVER);
  const [amTime, setAmTime] = useState("");
  const [pmTime, setPmTime] = useState("");
  const [notes, setNotes] = useState("");

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailIntro, setEmailIntro] = useState("");
  const [sending, setSending] = useState(false);

  const sendEmail = useServerFn(sendRunSheetEmail);

  const eligible = useMemo(
    () => students.filter((s) => s.paid && s.status === "Confirmed"),
    [students],
  );
  const schools = useMemo(
    () => Array.from(new Set(eligible.map((s) => s.schoolName).filter(Boolean))).sort(),
    [eligible],
  );
  const routes = useMemo(() => {
    const filtered = school === ALL ? eligible : eligible.filter((s) => s.schoolName === school);
    return Array.from(new Set(filtered.map((s) => (s.stopAddress || "Unassigned").trim()))).sort();
  }, [eligible, school]);

  const selectedStudents = useMemo(() => {
    return eligible.filter((s) => {
      if (school !== ALL && s.schoolName !== school) return false;
      if (route !== ALL && (s.stopAddress || "Unassigned").trim() !== route) return false;
      return true;
    });
  }, [eligible, school, route]);

  // Load saved driver info for selected route
  const driverKey = `${school}::${route}`;
  useEffect(() => {
    const map = loadDriverMap();
    setDriver(map[driverKey] ?? EMPTY_DRIVER);
  }, [driverKey]);

  const updateDriver = <K extends keyof DriverInfo>(k: K, v: DriverInfo[K]) =>
    setDriver((d) => ({ ...d, [k]: v }));

  const handleSaveDriver = () => {
    const map = loadDriverMap();
    map[driverKey] = driver;
    saveDriverMap(map);
    toast.success("Driver info saved for this route.");
  };

  const buildOpts = (): RunSheetOptions => ({
    schoolName: school === ALL ? "All Schools" : school,
    date,
    routeName: route === ALL ? "All Routes" : route,
    session,
    driverName: driver.morningDriverName || driver.afternoonDriverName || "",
    morningDriverName: driver.morningDriverName,
    afternoonDriverName: driver.afternoonDriverName,
    driverPhone: driver.driverPhone,
    driverEmail: driver.driverEmail,
    busNumber: driver.busNumber,
    vehicleNotes: driver.vehicleNotes,
    morningPickupTime: amTime,
    afternoonDropoffTime: pmTime,
    notes,
    students: selectedStudents,
  });

  const guard = () => {
    if (selectedStudents.length === 0) {
      toast.warning("No confirmed, paid riders match this selection.");
      return false;
    }
    return true;
  };

  const handlePreview = () => {
    if (!guard()) return;
    setPreviewUri(runSheetDataUri(buildOpts()));
  };
  const handleDownload = () => {
    if (!guard()) return;
    downloadRunSheet(buildOpts());
  };
  const handleOpenEmail = () => {
    if (!guard()) return;
    setEmailOpen(true);
  };

  const handleSend = async () => {
    const to = parseRecipients(emailTo);
    const cc = parseRecipients(emailCc);
    const bcc = parseRecipients(emailBcc);
    if (to.length === 0) { toast.error("Add at least one recipient in the To field."); return; }
    setSending(true);
    try {
      const opts = buildOpts();
      const pdfBase64 = runSheetBase64(opts);
      const result = await sendEmail({
        data: {
          to, cc, bcc,
          filename: runSheetFilename(opts),
          pdfBase64,
          intro: emailIntro.trim(),
          meta: {
            schoolName: opts.schoolName,
            routeName: opts.routeName,
            date: opts.date,
            session: opts.session,
            driverName: opts.driverName,
            busNumber: opts.busNumber,
            riderCount: opts.students.length,
          },
        },
      });
      await logAudit({
        action: "run_sheet.email_sent",
        entityType: "run_sheet",
        entityName: runSheetFilename(opts),
        details: {
          to, cc, bcc,
          school: opts.schoolName,
          route: opts.routeName,
          date: opts.date,
          session: opts.session,
          driverName: opts.driverName,
          busNumber: opts.busNumber,
          riderCount: opts.students.length,
          messageId: result?.id,
        },
      });
      toast.success(`Run sheet sent to ${to.join(", ")}`);
      setEmailOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Run Sheets"
        subtitle="Generate, preview, and email a daily driver run sheet from current confirmed riders."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 space-y-5">
            {/* Filters */}
            <div>
              <SectionLabel>Run sheet selection</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <Field label="School">
                  <Select value={school} onValueChange={(v) => { setSchool(v); setRoute(ALL); }}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All Schools</SelectItem>
                      {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-background" />
                </Field>
                <Field label="Route / Stop">
                  <Select value={route} onValueChange={setRoute}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All Routes</SelectItem>
                      {routes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Session">
                  <Select value={session} onValueChange={(v) => setSession(v as Session)}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Afternoon">Afternoon</SelectItem>
                      <SelectItem value="Both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {session !== "Afternoon" && (
                  <Field label="Morning pickup time">
                    <Input type="time" value={amTime} onChange={(e) => setAmTime(e.target.value)} className="bg-background" />
                  </Field>
                )}
                {session !== "Morning" && (
                  <Field label="Afternoon dropoff time">
                    <Input type="time" value={pmTime} onChange={(e) => setPmTime(e.target.value)} className="bg-background" />
                  </Field>
                )}
              </div>
            </div>

            {/* Driver info */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <SectionLabel>Driver &amp; vehicle</SectionLabel>
                <Button size="sm" variant="secondary" onClick={handleSaveDriver}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save Driver Info
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Saved per route &amp; school. Edit anytime — student addresses from Formstack are not affected.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="Morning driver">
                  <Input value={driver.morningDriverName} onChange={(e) => updateDriver("morningDriverName", e.target.value)} placeholder="e.g. Maria Lopez" className="bg-background" />
                </Field>
                <Field label="Afternoon driver">
                  <Input value={driver.afternoonDriverName} onChange={(e) => updateDriver("afternoonDriverName", e.target.value)} placeholder="e.g. James Carter" className="bg-background" />
                </Field>
                <Field label="Driver phone">
                  <Input value={driver.driverPhone} onChange={(e) => updateDriver("driverPhone", e.target.value)} placeholder="(203) 555-0199" className="bg-background" />
                </Field>
                <Field label="Driver email">
                  <Input type="email" value={driver.driverEmail} onChange={(e) => updateDriver("driverEmail", e.target.value)} placeholder="driver@example.com" className="bg-background" />
                </Field>
                <Field label="Bus number">
                  <Input value={driver.busNumber} onChange={(e) => updateDriver("busNumber", e.target.value)} placeholder="e.g. 26" className="bg-background" />
                </Field>
                <Field label="Vehicle notes">
                  <Input value={driver.vehicleNotes} onChange={(e) => updateDriver("vehicleNotes", e.target.value)} placeholder="Lift-equipped, spare radio, etc." className="bg-background" />
                </Field>
              </div>
            </div>

            <Field label="Driver notes / special instructions">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Allergies, gate codes, alternate drop-offs, etc."
                className="bg-background"
              />
            </Field>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
              <Button onClick={handleSaveDriver} variant="outline">
                <Save className="h-4 w-4 mr-2" /> Save Driver Info
              </Button>
              <Button onClick={handlePreview} variant="secondary">
                <Eye className="h-4 w-4 mr-2" /> Preview Run Sheet
              </Button>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
              <Button onClick={handleOpenEmail} variant="secondary">
                <Mail className="h-4 w-4 mr-2" /> Send Run Sheet Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Matching riders</div>
            <div className="text-3xl font-semibold mt-1 tabular-nums">{formatNumber(selectedStudents.length)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Confirmed &amp; paid students at the selected school/route.
            </div>
            <ul className="mt-4 max-h-72 overflow-auto divide-y divide-border text-xs">
              {selectedStudents.slice(0, 50).map((s) => (
                <li key={s.id} className="py-1.5">
                  <div className="font-medium truncate">{s.studentName}</div>
                  <div className="text-muted-foreground truncate">{s.stopAddress || "—"}</div>
                  {s.parentName && (
                    <div className="text-muted-foreground truncate">{s.parentName} · {s.parentPhone || "—"}</div>
                  )}
                </li>
              ))}
              {selectedStudents.length > 50 && (
                <li className="py-2 text-muted-foreground">+ {selectedStudents.length - 50} more…</li>
              )}
              {selectedStudents.length === 0 && (
                <li className="py-2 text-muted-foreground">No riders match the current filters.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewUri} onOpenChange={(o) => !o && setPreviewUri(null)}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Run Sheet Preview</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
            <div className="lg:col-span-2 h-full">
              {previewUri && (
                <iframe title="Run sheet preview" src={previewUri} className="w-full h-full rounded border border-border bg-white" />
              )}
            </div>
            <div className="overflow-auto text-sm space-y-3 pr-1">
              <PreviewRow label="School" value={school === ALL ? "All Schools" : school} />
              <PreviewRow label="Route / Stop" value={route === ALL ? "All Routes" : route} />
              <PreviewRow label="Date" value={date || "—"} />
              <PreviewRow label="Session" value={session} />
              <PreviewRow label="Morning driver" value={driver.morningDriverName || "—"} />
              <PreviewRow label="Afternoon driver" value={driver.afternoonDriverName || "—"} />
              <PreviewRow label="Driver phone" value={driver.driverPhone || "—"} />
              <PreviewRow label="Driver email" value={driver.driverEmail || "—"} />
              <PreviewRow label="Bus #" value={driver.busNumber || "—"} />
              <PreviewRow label="Vehicle notes" value={driver.vehicleNotes || "—"} />
              <PreviewRow label="Riders" value={String(selectedStudents.length)} />
              <PreviewRow label="To" value={parseRecipients(emailTo).join(", ") || "—"} />
              <PreviewRow label="CC" value={parseRecipients(emailCc).join(", ") || "—"} />
              <PreviewRow label="BCC" value={parseRecipients(emailBcc).join(", ") || "—"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewUri(null)}>Close</Button>
            <Button onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download PDF</Button>
            <Button onClick={() => { setPreviewUri(null); setEmailOpen(true); }} variant="default">
              <Mail className="h-4 w-4 mr-2" /> Send Email…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={(o) => !sending && setEmailOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Run Sheet Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="To (one or more, comma-separated)">
              <Input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="driver@example.com, dispatch@bandbtrans.com"
                className="bg-background"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="CC">
                <Input
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="optional"
                  className="bg-background"
                />
              </Field>
              <Field label="BCC">
                <Input
                  value={emailBcc}
                  onChange={(e) => setEmailBcc(e.target.value)}
                  placeholder="optional"
                  className="bg-background"
                />
              </Field>
            </div>
            <Field label="Message (optional)">
              <Textarea
                value={emailIntro}
                onChange={(e) => setEmailIntro(e.target.value)}
                rows={3}
                placeholder="Short note to include with the run sheet."
                className="bg-background"
              />
            </Field>
            <div className="text-[11px] text-muted-foreground">
              Sending from <span className="font-mono">B&amp;B Transportation &lt;info@bandbtrans.com&gt;</span>.
              PDF attached as <span className="font-mono">{runSheetFilename(buildOpts())}</span>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEmailOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{children}</div>;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-1.5">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

// Silence unused import warning for buildRunSheet (kept for re-export parity)
void buildRunSheet;
