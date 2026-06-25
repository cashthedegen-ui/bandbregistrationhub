import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Eye, Download, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/_app/run-sheets")({
  head: () => ({ meta: [{ title: "Run Sheets — B & B Transit" }] }),
  component: RunSheetsPage,
});

const ALL = "__all__";

function RunSheetsPage() {
  const { students } = useStore();

  const todayIso = new Date().toISOString().slice(0, 10);

  const [school, setSchool] = useState<string>(ALL);
  const [date, setDate] = useState<string>(todayIso);
  const [route, setRoute] = useState<string>(ALL);
  const [session, setSession] = useState<Session>("Both");
  const [driverName, setDriverName] = useState("");
  const [busNumber, setBusNumber] = useState("");
  const [amTime, setAmTime] = useState("");
  const [pmTime, setPmTime] = useState("");
  const [notes, setNotes] = useState("");

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
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

  const buildOpts = (): RunSheetOptions => ({
    schoolName: school === ALL ? "All Schools" : school,
    date,
    routeName: route === ALL ? "All Routes" : route,
    session,
    driverName,
    busNumber,
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
    const uri = runSheetDataUri(buildOpts());
    setPreviewUri(uri);
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
    if (!emailTo.trim()) { toast.error("Enter a recipient email."); return; }
    setSending(true);
    try {
      const opts = buildOpts();
      const pdfBase64 = runSheetBase64(opts);
      await sendEmail({
        data: {
          to: emailTo.trim(),
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
      toast.success(`Run sheet sent to ${emailTo.trim()}`);
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
        subtitle="Generate a printable daily driver run sheet from current confirmed riders."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <Field label="Driver name">
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="e.g. Maria Lopez" className="bg-background" />
              </Field>
              <Field label="Bus number">
                <Input value={busNumber} onChange={(e) => setBusNumber(e.target.value)} placeholder="e.g. 26" className="bg-background" />
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

            <Field label="Driver notes / special instructions">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Allergies, gate codes, alternate drop-offs, etc."
                className="bg-background"
              />
            </Field>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <Button onClick={handlePreview} variant="secondary">
                <Eye className="h-4 w-4 mr-2" /> Preview Run Sheet
              </Button>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Download PDF
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
              Confirmed & paid students at the selected school/route.
            </div>
            <ul className="mt-4 max-h-64 overflow-auto divide-y divide-border text-xs">
              {selectedStudents.slice(0, 50).map((s) => (
                <li key={s.id} className="py-1.5">
                  <div className="font-medium truncate">{s.studentName}</div>
                  <div className="text-muted-foreground truncate">{s.stopAddress || "—"}</div>
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

      <Dialog open={!!previewUri} onOpenChange={(o) => !o && setPreviewUri(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Run Sheet Preview</DialogTitle>
          </DialogHeader>
          {previewUri && (
            <iframe title="Run sheet preview" src={previewUri} className="flex-1 w-full rounded border border-border bg-white" />
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewUri(null)}>Close</Button>
            <Button onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailOpen} onOpenChange={(o) => !sending && setEmailOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Email Run Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Recipient email">
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="driver@example.com"
                className="bg-background"
              />
            </Field>
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
              The PDF is attached as <span className="font-mono">{runSheetFilename(buildOpts())}</span>.
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

// Silence unused import warning for buildRunSheet (kept for re-export parity)
void buildRunSheet;
