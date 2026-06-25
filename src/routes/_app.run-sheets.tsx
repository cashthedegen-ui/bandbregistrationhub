import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Eye, Download, Mail, Loader2, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/_app/run-sheets")({
  head: () => ({ meta: [{ title: "Run Sheets — B & B Transit" }] }),
  component: RunSheetsPage,
});

const ALL = "__all__";
const DRIVER_STORE_KEY = "bb.runsheet.drivers.v2";

interface DriverSlot {
  name: string;
  phone: string;
  email: string;
  busNumber: string;
  vehicleNotes: string;
}

interface DriverAssignment {
  sameForBoth: boolean;
  am: DriverSlot;
  pm: DriverSlot;
}

const EMPTY_SLOT: DriverSlot = { name: "", phone: "", email: "", busNumber: "", vehicleNotes: "" };
const EMPTY_ASSIGNMENT: DriverAssignment = { sameForBoth: true, am: { ...EMPTY_SLOT }, pm: { ...EMPTY_SLOT } };

function loadDriverMap(): Record<string, DriverAssignment> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRIVER_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveDriverMap(map: Record<string, DriverAssignment>) {
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

  const [assignment, setAssignment] = useState<DriverAssignment>(EMPTY_ASSIGNMENT);
  const [amTime, setAmTime] = useState("");
  const [pmTime, setPmTime] = useState("");
  const [notes, setNotes] = useState("");

  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailIntro, setEmailIntro] = useState("");

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
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

  // Load saved assignment for selected route/school
  const driverKey = `${school}::${route}`;
  useEffect(() => {
    const map = loadDriverMap();
    setAssignment(map[driverKey] ?? EMPTY_ASSIGNMENT);
  }, [driverKey]);

  const updateSlot = (which: "am" | "pm", k: keyof DriverSlot, v: string) =>
    setAssignment((a) => ({ ...a, [which]: { ...a[which], [k]: v } }));

  const handleSaveDriver = () => {
    const map = loadDriverMap();
    map[driverKey] = assignment;
    saveDriverMap(map);
    toast.success("Driver assignment saved for this route.");
  };

  // Which slots are needed for current session
  const needAm = session !== "Afternoon";
  const needPm = session !== "Morning";
  const showSameToggle = session === "Both";
  const effectivePm: DriverSlot =
    session === "Both" && assignment.sameForBoth ? assignment.am : assignment.pm;

  const buildOpts = (): RunSheetOptions => {
    // Primary fields for the PDF header band
    const primary: DriverSlot =
      session === "Afternoon" ? effectivePm : assignment.am;
    // For "Both + separate", append PM driver info into vehicleNotes so it shows on the sheet
    let vehicleNotes = primary.vehicleNotes;
    if (session === "Both" && !assignment.sameForBoth) {
      const pmLine = [
        assignment.pm.name && `PM Driver: ${assignment.pm.name}`,
        assignment.pm.phone && `Phone: ${assignment.pm.phone}`,
        assignment.pm.busNumber && `Bus #${assignment.pm.busNumber}`,
        assignment.pm.vehicleNotes,
      ].filter(Boolean).join(" · ");
      vehicleNotes = [primary.vehicleNotes, pmLine].filter(Boolean).join(" | ");
    }
    return {
      schoolName: school === ALL ? "All Schools" : school,
      date,
      routeName: route === ALL ? "All Routes" : route,
      session,
      driverName: primary.name || effectivePm.name || "",
      morningDriverName: needAm ? assignment.am.name : "",
      afternoonDriverName: needPm ? effectivePm.name : "",
      driverPhone: primary.phone,
      driverEmail: primary.email,
      busNumber: primary.busNumber,
      vehicleNotes,
      morningPickupTime: amTime,
      afternoonDropoffTime: pmTime,
      notes,
      students: selectedStudents,
    };
  };

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
    if (parseRecipients(emailTo).length === 0) {
      toast.warning("Add at least one address in the Send to field first.");
      return;
    }
    setEmailOpen(true);
  };

  const handleSend = async () => {
    const to = parseRecipients(emailTo);
    const cc = parseRecipients(emailCc);
    const bcc = parseRecipients(emailBcc);
    if (to.length === 0) { toast.error("Add at least one recipient in the Send to field."); return; }
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
                      <SelectItem value="Morning">Morning only</SelectItem>
                      <SelectItem value="Afternoon">Afternoon only</SelectItem>
                      <SelectItem value="Both">Both (AM + PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {needAm && (
                  <Field label="Morning pickup time">
                    <Input type="time" value={amTime} onChange={(e) => setAmTime(e.target.value)} className="bg-background" />
                  </Field>
                )}
                {needPm && (
                  <Field label="Afternoon dropoff time">
                    <Input type="time" value={pmTime} onChange={(e) => setPmTime(e.target.value)} className="bg-background" />
                  </Field>
                )}
              </div>
            </div>

            {/* Driver Assignment */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <SectionLabel>Driver Assignment</SectionLabel>
                <Button size="sm" variant="secondary" onClick={handleSaveDriver}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save Driver Assignment
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Saved per route &amp; school. Edit anytime — student pickup/dropoff addresses come from Formstack
                and are <strong>not</strong> overwritten by driver edits.
              </p>

              {showSameToggle && (
                <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
                  <Switch
                    id="same-driver"
                    checked={assignment.sameForBoth}
                    onCheckedChange={(v) => setAssignment((a) => ({ ...a, sameForBoth: v }))}
                  />
                  <Label htmlFor="same-driver" className="text-sm cursor-pointer">
                    Same driver for AM and PM
                  </Label>
                </div>
              )}

              {/* Slot rendering */}
              {(() => {
                // Morning only
                if (session === "Morning") {
                  return <DriverSection title="Morning Driver" slot={assignment.am} onChange={(k, v) => updateSlot("am", k, v)} />;
                }
                // Afternoon only
                if (session === "Afternoon") {
                  return <DriverSection title="Afternoon Driver" slot={assignment.pm} onChange={(k, v) => updateSlot("pm", k, v)} />;
                }
                // Both + same
                if (assignment.sameForBoth) {
                  return <DriverSection title="Driver (AM + PM)" slot={assignment.am} onChange={(k, v) => updateSlot("am", k, v)} />;
                }
                // Both + separate
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                    <DriverSection title="Morning Driver" slot={assignment.am} onChange={(k, v) => updateSlot("am", k, v)} />
                    <DriverSection title="Afternoon Driver" slot={assignment.pm} onChange={(k, v) => updateSlot("pm", k, v)} />
                  </div>
                );
              })()}
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

            {/* Email recipients */}
            <div className="pt-4 border-t border-border">
              <SectionLabel>Email Recipients</SectionLabel>
              <p className="text-[11px] text-muted-foreground mt-1">
                Fill in before sending. Separate multiple addresses with commas. Nothing is sent automatically.
              </p>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <Field label="Send to">
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="driver@example.com, dispatch@bandbtrans.com"
                    className="bg-background"
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="CC">
                    <Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="optional" className="bg-background" />
                  </Field>
                  <Field label="BCC">
                    <Input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="optional" className="bg-background" />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
              <Button onClick={handleSaveDriver} variant="outline">
                <Save className="h-4 w-4 mr-2" /> Save Driver Assignment
              </Button>
              <Button onClick={handlePreview} variant="secondary">
                <Eye className="h-4 w-4 mr-2" /> Preview Run Sheet
              </Button>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Download Run Sheet PDF
              </Button>
              <Button onClick={handleOpenEmail} variant="secondary">
                <Mail className="h-4 w-4 mr-2" /> Email Run Sheet
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
            <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-background/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Pickup &amp; dropoff addresses are pulled from each student&apos;s Formstack submission. Driver edits never overwrite them.</span>
            </div>
            <ul className="mt-3 max-h-[28rem] overflow-auto divide-y divide-border text-xs">
              {selectedStudents.slice(0, 50).map((s) => {
                const pickup = s.stopAddress || s.address || "—";
                const dropoff = (s as any).dropoffAddress || s.schoolName || "—";
                const note = s.notes || (s as any).specialInstructions || "";
                return (
                  <li key={s.id} className="py-2 space-y-1">
                    <div className="font-medium truncate">{s.studentName}</div>
                    {s.parentName && (
                      <div className="text-muted-foreground truncate">
                        {s.parentName}{s.parentPhone ? ` · ${s.parentPhone}` : ""}
                      </div>
                    )}
                    <div className="text-muted-foreground"><span className="text-foreground/70">Pickup:</span> {pickup}</div>
                    <div className="text-muted-foreground"><span className="text-foreground/70">Dropoff:</span> {dropoff}</div>
                    {note && (
                      <div className="text-amber-400/90"><span className="text-foreground/70">Notes:</span> {note}</div>
                    )}
                  </li>
                );
              })}
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
              {needAm && (
                <>
                  <PreviewRow label="AM Driver" value={assignment.am.name || "—"} />
                  <PreviewRow label="AM Phone" value={assignment.am.phone || "—"} />
                  <PreviewRow label="AM Bus #" value={assignment.am.busNumber || "—"} />
                </>
              )}
              {needPm && (
                <>
                  <PreviewRow label="PM Driver" value={effectivePm.name || "—"} />
                  <PreviewRow label="PM Phone" value={effectivePm.phone || "—"} />
                  <PreviewRow label="PM Bus #" value={effectivePm.busNumber || "—"} />
                </>
              )}
              <PreviewRow label="Riders" value={String(selectedStudents.length)} />
              <PreviewRow label="To" value={parseRecipients(emailTo).join(", ") || "—"} />
              <PreviewRow label="CC" value={parseRecipients(emailCc).join(", ") || "—"} />
              <PreviewRow label="BCC" value={parseRecipients(emailBcc).join(", ") || "—"} />
              <div className="pt-2">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Students</div>
                <ul className="space-y-2">
                  {selectedStudents.slice(0, 25).map((s) => (
                    <li key={s.id} className="rounded border border-border p-2">
                      <div className="font-medium">{s.studentName}</div>
                      <div className="text-xs text-muted-foreground">Pickup: {s.stopAddress || s.address || "—"}</div>
                      <div className="text-xs text-muted-foreground">Dropoff: {(s as any).dropoffAddress || s.schoolName || "—"}</div>
                    </li>
                  ))}
                  {selectedStudents.length > 25 && (
                    <li className="text-xs text-muted-foreground">+ {selectedStudents.length - 25} more on the PDF…</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewUri(null)}>Close</Button>
            <Button onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download Run Sheet PDF</Button>
            <Button onClick={() => { setPreviewUri(null); handleOpenEmail(); }} variant="default">
              <Mail className="h-4 w-4 mr-2" /> Email Run Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email confirmation dialog */}
      <Dialog open={emailOpen} onOpenChange={(o) => !sending && setEmailOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Run Sheet Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border border-border p-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">To:</span> {parseRecipients(emailTo).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">CC:</span> {parseRecipients(emailCc).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">BCC:</span> {parseRecipients(emailBcc).join(", ") || "—"}</div>
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

function DriverSection({
  title, slot, onChange,
}: {
  title: string;
  slot: DriverSlot;
  onChange: (k: keyof DriverSlot, v: string) => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-background/30 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Driver name">
          <Input value={slot.name} onChange={(e) => onChange("name", e.target.value)} placeholder="e.g. Maria Lopez" className="bg-background" />
        </Field>
        <Field label="Driver phone">
          <Input value={slot.phone} onChange={(e) => onChange("phone", e.target.value)} placeholder="(203) 555-0199" className="bg-background" />
        </Field>
        <Field label="Driver email">
          <Input type="email" value={slot.email} onChange={(e) => onChange("email", e.target.value)} placeholder="driver@example.com" className="bg-background" />
        </Field>
        <Field label="Bus number">
          <Input value={slot.busNumber} onChange={(e) => onChange("busNumber", e.target.value)} placeholder="e.g. 26" className="bg-background" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Vehicle notes">
            <Input value={slot.vehicleNotes} onChange={(e) => onChange("vehicleNotes", e.target.value)} placeholder="Lift-equipped, spare radio, etc." className="bg-background" />
          </Field>
        </div>
      </div>
    </div>
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
