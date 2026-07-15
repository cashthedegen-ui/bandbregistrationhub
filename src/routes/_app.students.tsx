import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle, Archive, BadgeCheck, CheckCheck, ChevronDown, ChevronRight,
  Copy, Download, FileText, Filter, Mail, MailCheck, MoreHorizontal, Pencil, Phone,
  Search, Send, StickyNote, Trash2, Wallet, Wrench, X,
} from "lucide-react";
import { PaymentPlanDrawer } from "@/components/payment-plan-drawer";
import type { PaymentStatus, PaymentType, Status, StudentRow } from "@/lib/types";
import { exportRows, exportStudentsClean } from "@/lib/excel";
import { downloadAllReceipts, downloadReceipt } from "@/lib/receipt";
import { ReceiptModal } from "@/components/receipt-modal";
import { ConfirmationLetterModal } from "@/components/confirmation-letter-modal";
import { CommunicationPreviewModal } from "@/components/communication-preview-modal";
import { StudentCommunicationHistory } from "@/components/student-communication-history";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { fetchAllPlans, familyKeyOf, type PaymentPlan } from "@/lib/payment-plans";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/students")({
  head: () => ({ meta: [{ title: "Students — B & B Transit" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? s.status : undefined,
    alerts: s.alerts === "1" || s.alerts === 1 || s.alerts === true ? true : undefined,
    duplicates: s.duplicates === "1" || s.duplicates === 1 || s.duplicates === true ? true : undefined,
    payment: typeof s.payment === "string" ? s.payment : undefined,
    quick: typeof s.quick === "string" ? s.quick : undefined,
  }),
  component: StudentsPage,
});

const STATUSES: Status[] = ["New", "Reviewed", "Confirmed", "Waitlisted"];
const PAYMENTS: PaymentStatus[] = ["Pending", "Received", "Overdue"];
const PAYMENT_TYPES: PaymentType[] = ["Self Pay", "Financial Aid", "Unpaid"];

type QuickChip = "all" | "pending" | "paid" | "financial-aid" | "payment-plans" | "needs-review" | "duplicates" | "archived";

const PAYMENT_STATUS_CLASS: Record<PaymentStatus, string> = {
  Pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Received: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
};

const PAYMENT_TYPE_CLASS: Record<string, string> = {
  "Self Pay": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Financial Aid": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Payment Plan": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "Unpaid": "bg-red-500/15 text-red-300 border-red-500/30",
};

const STATUS_CLASS: Record<Status, string> = {
  New: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Reviewed: "bg-primary/15 text-primary border-primary/30",
  Confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Waitlisted: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  );
}

function StudentsPage() {
  const { students, updateStudent, deleteStudent, dupGroups, settings, repairingStLukesNames, repairStLukesParkingShuttleNames } = useStore();
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string>("all");
  const [status, setStatus] = useState<string>(search.status ?? "all");
  const [grade, setGrade] = useState<string>("all");
  const [alertsOnly, setAlertsOnly] = useState<boolean>(!!search.alerts);
  const [duplicatesOnly, setDuplicatesOnly] = useState<boolean>(!!search.duplicates);
  const [paymentFilter, setPaymentFilter] = useState<string>(search.payment ?? "all");
  const [quick, setQuick] = useState<QuickChip>((search.quick as QuickChip) || "all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<StudentRow | null>(null);
  const [dupBanner, setDupBanner] = useState(true);
  const [dupGroupOpen, setDupGroupOpen] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<StudentRow[] | null>(null);
  const [notesRow, setNotesRow] = useState<StudentRow | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [editRow, setEditRow] = useState<StudentRow | null>(null);
  const [editDraft, setEditDraft] = useState<StudentRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<StudentRow | null>(null);
  const [confirmLetterRow, setConfirmLetterRow] = useState<StudentRow | null>(null);
  const [planAnchor, setPlanAnchor] = useState<StudentRow | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingPayStatusId, setEditingPayStatusId] = useState<string | null>(null);
  const [commsRow, setCommsRow] = useState<StudentRow | null>(null);
  const [commsRefresh, setCommsRefresh] = useState(0);
  const [repairResult, setRepairResult] = useState<null | {
    scanned: number;
    repaired: number;
    skipped: number;
    unresolved: Array<{ id: string; submissionId: string; parentName: string; reason: string }>;
  }>(null);

  // Read-only: fetch plan family keys so we can show a "Payment Plan" badge / filter.
  const [planFamilyKeys, setPlanFamilyKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancel = false;
    fetchAllPlans().then((plans: PaymentPlan[]) => {
      if (cancel) return;
      const live = plans.filter((p) => p.status !== "Cancelled" && p.status !== "Removed by Admin");
      setPlanFamilyKeys(new Set(live.map((p) => p.family_key)));
    }).catch(() => {});
    return () => { cancel = true; };
  }, [students.length]);

  const schools = useMemo(() => Array.from(new Set(students.map((s) => s.schoolName))).filter(Boolean), [students]);
  const grades = useMemo(() => Array.from(new Set(students.map((s) => s.grade))).filter(Boolean), [students]);

  const effectiveType = (r: StudentRow): "Self Pay" | "Financial Aid" | "Payment Plan" | "Unpaid" => {
    if (planFamilyKeys.has(familyKeyOf(r))) return "Payment Plan";
    return r.paymentType || (r.paid ? "Self Pay" : "Unpaid");
  };

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return students.filter((s) => {
      if (school !== "all" && s.schoolName !== school) return false;
      if (status !== "all" && s.status !== status) return false;
      if (grade !== "all" && s.grade !== grade) return false;
      if (alertsOnly && !s.alertFlag) return false;
      if (duplicatesOnly && !s.duplicateFlag) return false;
      if (paymentFilter !== "all" && s.paymentStatus !== paymentFilter) return false;
      if (quick !== "all") {
        const t = effectiveType(s);
        const ps = s.paymentStatus || "Pending";
        if (quick === "pending" && ps !== "Pending") return false;
        if (quick === "paid" && ps !== "Received") return false;
        if (quick === "financial-aid" && t !== "Financial Aid") return false;
        if (quick === "payment-plans" && t !== "Payment Plan") return false;
        if (quick === "needs-review" && s.status !== "New") return false;
        if (quick === "duplicates" && !s.duplicateFlag) return false;
        if (quick === "archived") return false; // students table has no archived flag
      }
      if (qq && !(`${s.studentName} ${s.parentName} ${s.parentEmail} ${s.stopAddress}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [students, q, school, status, grade, alertsOnly, duplicatesOnly, paymentFilter, quick, planFamilyKeys]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  const selectedRows = students.filter((s) => selected.has(s.id));

  const bulkMarkReviewed = () => {
    selectedRows.forEach((r) => updateStudent(r.id, { status: "Reviewed" }));
    toast.success(`Marked ${selectedRows.length} reviewed`);
  };
  const bulkExport = () => {
    if (!selectedRows.length) return toast.warning("No rows selected");
    exportRows(selectedRows, "BB_Transit_Selected.xlsx");
    selectedRows.forEach((r) => updateStudent(r.id, { status: "Reviewed" }));
  };
  const bulkReceipts = () => {
    if (!selectedRows.length) return toast.warning("No rows selected");
    setReceiptOpen(selectedRows);
  };
  const bulkSetPaymentStatus = (v: PaymentStatus) => {
    selectedRows.forEach((r) => updateStudent(r.id, { paymentStatus: v }));
    toast.success(`Payment status → ${v}`);
  };
  const bulkSetStatus = (v: Status) => {
    selectedRows.forEach((r) => updateStudent(r.id, { status: v }));
    toast.success(`Status → ${v}`);
  };
  const bulkSetPaymentType = (v: PaymentType) => {
    selectedRows.forEach((r) => updateStudent(r.id, { paymentType: v, paid: v !== "Unpaid" }));
    toast.success(`Payment type → ${v}`);
  };
  const bulkSendReminder = () => {
    const emails = Array.from(new Set(selectedRows.map((r) => r.parentEmail).filter(Boolean)));
    if (!emails.length) return toast.warning("No parent emails on selected rows");
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent("B & B Transit — Payment Reminder")}`;
  };

  const markAllReviewed = () => {
    const newOnes = students.filter((s) => s.status === "New");
    if (!newOnes.length) return toast.info("No students with status 'New'");
    newOnes.forEach((r) => updateStudent(r.id, { status: "Reviewed" }));
    toast.success(`Marked ${newOnes.length} as Reviewed`);
  };

  const exportAllClean = () => {
    if (!students.length) return toast.warning("No students to export");
    exportStudentsClean(students);
    toast.success(`Exported ${students.length} students`);
  };

  const activeDupGroup = dupGroupOpen ? dupGroups.find((g) => g.id === dupGroupOpen) : null;

  const newCount = students.filter((s) => s.status === "New").length;

  const chip = (key: QuickChip, label: string, count?: number, tint?: string) => (
    <button
      key={key}
      onClick={() => setQuick(key)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        quick === key
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : cn("bg-background/60 hover:bg-accent border-border", tint),
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
          quick === key ? "bg-primary-foreground/20" : "bg-muted",
        )}>{formatNumber(count)}</span>
      )}
    </button>
  );

  const chipCounts = useMemo(() => {
    let pending = 0, paid = 0, fa = 0, plans = 0, needs = 0;
    for (const s of students) {
      if ((s.paymentStatus || "Pending") === "Pending") pending++;
      if (s.paymentStatus === "Received") paid++;
      const t = effectiveType(s);
      if (t === "Financial Aid") fa++;
      if (t === "Payment Plan") plans++;
      if (s.status === "New") needs++;
    }
    return { pending, paid, fa, plans, needs, duplicates: students.filter((s) => s.duplicateFlag).length };
  }, [students, planFamilyKeys]);

  const rowTint = (r: StudentRow): string => {
    const ps = r.paymentStatus || "Pending";
    const t = effectiveType(r);
    if (t === "Financial Aid") return "bg-sky-500/[0.04]";
    if (ps === "Received") return "bg-emerald-500/[0.04]";
    if (ps === "Pending") return "bg-amber-500/[0.03]";
    return "";
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${formatNumber(filtered.length)} of ${formatNumber(students.length)} students`}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={repairingStLukesNames}
              onClick={async () => {
                try {
                  const result = await repairStLukesParkingShuttleNames();
                  setRepairResult(result);
                } catch {
                  // Store action already shows the error toast.
                }
              }}
            >
              <Wrench className="h-4 w-4 mr-1.5" />
              {repairingStLukesNames ? "Repairing…" : "Repair St. Luke’s Parking Shuttle Names"}
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={exportAllClean}>
              <Download className="h-4 w-4 mr-1.5" /> Export Excel
            </Button>
          </div>
        }
      />

      {repairResult && (
        <Card className="mb-4 border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <span>St. Luke’s repair scanned {repairResult.scanned} records.</span>
            <span className="text-emerald-300">{repairResult.repaired} repaired</span>
            <span className="text-muted-foreground">{repairResult.skipped} skipped</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setRepairResult(null)}>Dismiss</Button>
          </div>
          {repairResult.unresolved.length > 0 && (
            <div className="mt-3 rounded-md border border-border bg-background/60 p-3 text-xs">
              <div className="mb-2 font-medium text-foreground">Records still missing a usable Driver Name</div>
              <div className="space-y-1">
                {repairResult.unresolved.map((item) => (
                  <div key={item.id} className="grid gap-1 md:grid-cols-[160px_160px_1fr]">
                    <span>{item.parentName || item.id}</span>
                    <span className="text-muted-foreground">Submission {item.submissionId || "—"}</span>
                    <span className="text-muted-foreground">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {dupGroups.length > 0 && dupBanner && (
        <Card className="mb-4 border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
          <Copy className="h-4 w-4 text-primary" />
          <span className="text-sm">
            {dupGroups.length} potential duplicate {dupGroups.length === 1 ? "group" : "groups"} detected.
          </span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setDupGroupOpen(dupGroups[0].id)}>
            Review duplicates
          </Button>
          <button onClick={() => setDupBanner(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </Card>
      )}

      {/* Quick filter chips + review workflow */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip("all", "All", students.length)}
        {chip("pending", "Pending", chipCounts.pending)}
        {chip("paid", "Paid", chipCounts.paid)}
        {chip("financial-aid", "Financial Aid", chipCounts.fa)}
        {chip("payment-plans", "Payment Plans", chipCounts.plans)}
        {chip("needs-review", "Needs Review", chipCounts.needs)}
        {chip("duplicates", "Duplicates", chipCounts.duplicates)}
        {chip("archived", "Archived", 0)}
        {newCount > 0 && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={markAllReviewed}>
            <CheckCheck className="h-4 w-4 mr-1.5" /> Mark All Reviewed ({newCount})
          </Button>
        )}
      </div>

      <Card className="bg-card border-border p-3 mb-4">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by student, parent, email, stop…" className="pl-9 bg-background" />
          </div>
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="w-full md:w-44 bg-background"><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-36 bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-full md:w-32 bg-background"><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {grades.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {(alertsOnly || duplicatesOnly || paymentFilter !== "all") && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {alertsOnly && (
              <button onClick={() => setAlertsOnly(false)} className="text-[11px] rounded-full border border-red-500/40 bg-red-500/10 text-red-300 px-2 py-0.5 hover:bg-red-500/20">
                Alert flags <X className="inline h-3 w-3 ml-1" />
              </button>
            )}
            {duplicatesOnly && (
              <button onClick={() => setDuplicatesOnly(false)} className="text-[11px] rounded-full border border-primary/40 bg-primary/10 text-primary px-2 py-0.5 hover:bg-primary/20">
                Duplicates <X className="inline h-3 w-3 ml-1" />
              </button>
            )}
            {paymentFilter !== "all" && (
              <button onClick={() => setPaymentFilter("all")} className="text-[11px] rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 px-2 py-0.5 hover:bg-yellow-500/20">
                Payment: {paymentFilter} <X className="inline h-3 w-3 ml-1" />
              </button>
            )}
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">No students match your filters.</div>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden @container/students">
          {/* ============ CARD LAYOUT: tablet portrait & narrow (below @3xl) ============ */}
          <div className="@3xl/students:hidden divide-y divide-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
              <span>Select all ({filtered.length})</span>
            </div>
            {filtered.map((r) => {
              const isExpanded = expanded.has(r.id);
              const tint = rowTint(r);
              const et = effectiveType(r);
              const ps = r.paymentStatus || "Pending";
              return (
                <div key={r.id} className={cn("p-3 transition-colors", tint)}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1 shrink-0"
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                    <button
                      onClick={() => toggleExpand(r.id)}
                      className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            onClick={() => setOpenRow(r)}
                            className="text-left font-semibold text-foreground hover:text-primary transition-colors break-words"
                          >
                            {r.studentName}
                          </button>
                          <div className="text-xs text-muted-foreground break-words">
                            Grade {r.grade} • {r.schoolName}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {r.alertFlag && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          {r.duplicateFlag && (
                            <button
                              onClick={() => setDupGroupOpen(r.duplicateGroupId || null)}
                              className="text-primary"
                              title="Potential duplicate"
                            ><Copy className="h-4 w-4" /></button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 @sm/students:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Route</div>
                          <div className="break-words">{r.stopAddress || "—"}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Parent</div>
                          <div className="break-words">{r.parentName || "—"}</div>
                          {r.parentPhone && <div className="text-muted-foreground">{r.parentPhone}</div>}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => setEditingStatusId(r.id)}
                          className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_CLASS[r.status])}
                        >
                          {r.status}
                        </button>
                        <button
                          onClick={() => setEditingPayStatusId(r.id)}
                          className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", PAYMENT_STATUS_CLASS[ps])}
                        >
                          {ps === "Received" ? "Paid" : ps}
                        </button>
                        <button
                          onClick={() => setEditingTypeId(r.id)}
                          className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", PAYMENT_TYPE_CLASS[et])}
                        >
                          {et}
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setEditRow(r); setEditDraft({ ...r }); }}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                              <Mail className="h-3.5 w-3.5 mr-1" /> Contact
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuLabel>{r.parentName || "Parent"}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {r.parentEmail && (
                              <DropdownMenuItem asChild>
                                <a href={`mailto:${r.parentEmail}`}><Mail className="h-4 w-4 mr-2" /> Email {r.parentEmail}</a>
                              </DropdownMenuItem>
                            )}
                            {r.parentPhone && (
                              <DropdownMenuItem asChild>
                                <a href={`tel:${r.parentPhone}`}><Phone className="h-4 w-4 mr-2" /> Call {r.parentPhone}</a>
                              </DropdownMenuItem>
                            )}
                            {r.parentPhone && (
                              <DropdownMenuItem asChild>
                                <a href={`sms:${r.parentPhone}`}><Send className="h-4 w-4 mr-2" /> Text {r.parentPhone}</a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                              <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> More
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border w-56">
                            {r.status !== "Confirmed" && (
                              <>
                                <DropdownMenuItem onClick={() => { updateStudent(r.id, { status: "Confirmed" }); toast.success(`${r.studentName} confirmed`); }}>
                                  <BadgeCheck className="h-4 w-4 mr-2 text-emerald-400" /> Mark Confirmed
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => { setNotesRow(r); setNotesDraft(r.notes || ""); }}>
                              <StickyNote className="h-4 w-4 mr-2" /> Internal Notes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPlanAnchor(r)}>
                              <Wallet className="h-4 w-4 mr-2" /> Payment History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReceiptOpen([r])}>
                              <FileText className="h-4 w-4 mr-2" /> Generate Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadReceipt(r, settings.receipt)}>
                              <Download className="h-4 w-4 mr-2" /> Download PDF
                            </DropdownMenuItem>
                            {r.status === "Confirmed" && (
                              <DropdownMenuItem onClick={() => setConfirmLetterRow(r)}>
                                <MailCheck className="h-4 w-4 mr-2 text-emerald-400" /> Confirmation Letter
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link to="/archive"><Archive className="h-4 w-4 mr-2" /> Archive (Season)</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteRow(r)} className="text-red-400 focus:text-red-400">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete Student
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 rounded-md border border-border bg-muted/10 p-3">
                      <ExpandedRow
                        r={r}
                        et={et}
                        onEdit={() => { setEditRow(r); setEditDraft({ ...r }); }}
                        onNotes={() => { setNotesRow(r); setNotesDraft(r.notes || ""); }}
                        onPayHistory={() => setPlanAnchor(r)}
                        onReceipt={() => setReceiptOpen([r])}
                        onDelete={() => setDeleteRow(r)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ============ COMPACT TABLE: laptop / tablet landscape and up (@3xl+) ============ */}
          <div className="hidden @3xl/students:block overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0 table-fixed">
              <colgroup>
                <col className="w-10" />
                <col style={{ width: "18%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "15%" }} />
                <col className="hidden @6xl/students:table-column" style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3.5 border-b border-border">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3.5 text-left border-b border-border">Student / Grade</th>
                  <th className="px-3 py-3.5 text-left border-b border-border">School / Route</th>
                  <th className="px-3 py-3.5 text-left border-b border-border">Parent / Phone</th>
                  <th className="px-3 py-3.5 text-left border-b border-border">Status</th>
                  <th className="px-3 py-3.5 text-left border-b border-border">Billing</th>
                  <th className="hidden @6xl/students:table-cell px-3 py-3.5 text-left border-b border-border">Submitted</th>
                  <th className="px-3 py-3.5 text-right border-b border-border pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isExpanded = expanded.has(r.id);
                  const tint = rowTint(r);
                  const et = effectiveType(r);
                  const ps = r.paymentStatus || "Pending";
                  return (
                    <>
                      <tr key={r.id} className={cn("group transition-colors hover:bg-muted/30 align-top", tint)}>
                        <td className="px-3 py-3 border-b border-border">
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selected);
                              if (v) next.add(r.id); else next.delete(r.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              onClick={() => toggleExpand(r.id)}
                              className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <HoverCard openDelay={200} closeDelay={80}>
                                <HoverCardTrigger asChild>
                                  <button
                                    onClick={() => setOpenRow(r)}
                                    className="text-left font-semibold text-foreground hover:text-primary transition-colors block w-full truncate"
                                    title={r.studentName}
                                  >
                                    {r.studentName}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80 bg-card border-border" side="right" align="start">
                                  <div className="space-y-2">
                                    <div>
                                      <div className="font-semibold text-base leading-tight">{r.studentName}</div>
                                      <div className="text-xs text-muted-foreground">{r.schoolName} • Grade {r.grade}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      <StatusBadge status={r.status} />
                                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", PAYMENT_TYPE_CLASS[et])}>{et}</span>
                                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", PAYMENT_STATUS_CLASS[ps])}>{ps}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                      <MiniField label="Route / Stop" value={r.stopAddress || "—"} />
                                      <MiniField label="Parent" value={r.parentName || "—"} />
                                      <MiniField label="Phone" value={r.parentPhone || "—"} />
                                      <MiniField label="Balance" value={formatCurrency(r.paymentType === "Financial Aid" ? Math.max(0, (r.schoolOwes ?? 0) - (r.schoolPaidAmount ?? 0)) : Math.max(0, (r.rtAmount ?? 0) + (r.owAmount ?? 0) - (r.amountPaid ?? 0)))} />
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                              <div className="text-xs text-muted-foreground truncate">Grade {r.grade}</div>
                              <div className="mt-1 flex gap-1">
                                {r.alertFlag && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                                    <AlertTriangle className="h-3 w-3" /> Alert
                                  </span>
                                )}
                                {r.duplicateFlag && (
                                  <button
                                    onClick={() => setDupGroupOpen(r.duplicateGroupId || null)}
                                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                                  >
                                    <Copy className="h-3 w-3" /> Dup
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="min-w-0">
                            <div className="text-foreground line-clamp-2 break-words" title={r.schoolName}>{r.schoolName}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2 break-words" title={r.stopAddress || ""}>{r.stopAddress || "—"}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="min-w-0">
                            <div className="text-foreground truncate" title={r.parentName}>{r.parentName}</div>
                            <div className="text-xs text-muted-foreground truncate" title={r.parentPhone}>{r.parentPhone}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          {editingStatusId === r.id ? (
                            <Select
                              defaultOpen
                              value={r.status}
                              onValueChange={(v) => { updateStudent(r.id, { status: v as Status }); setEditingStatusId(null); }}
                            >
                              <SelectTrigger className="h-7 w-full bg-background text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <button
                              onClick={() => setEditingStatusId(r.id)}
                              className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium hover:opacity-80 max-w-full truncate", STATUS_CLASS[r.status])}
                            >
                              {r.status}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 border-b border-border">
                          <div className="flex flex-col gap-1 items-start min-w-0">
                            {editingPayStatusId === r.id ? (
                              <Select
                                defaultOpen
                                value={ps}
                                onValueChange={(v) => { updateStudent(r.id, { paymentStatus: v as PaymentStatus }); setEditingPayStatusId(null); }}
                              >
                                <SelectTrigger className={`h-7 w-full text-xs border ${PAYMENT_STATUS_CLASS[ps]}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                onClick={() => setEditingPayStatusId(r.id)}
                                className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium hover:opacity-80 max-w-full truncate", PAYMENT_STATUS_CLASS[ps])}
                              >
                                {ps === "Received" ? "Paid" : ps}
                              </button>
                            )}
                            {editingTypeId === r.id ? (
                              <Select
                                defaultOpen
                                value={r.paymentType || (r.paid ? "Self Pay" : "Unpaid")}
                                onValueChange={(v) => { updateStudent(r.id, { paymentType: v as PaymentType, paid: v !== "Unpaid" }); setEditingTypeId(null); }}
                              >
                                <SelectTrigger className={`h-7 w-full text-xs border ${PAYMENT_TYPE_CLASS[et]}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                onClick={() => setEditingTypeId(r.id)}
                                className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium hover:opacity-80 max-w-full truncate", PAYMENT_TYPE_CLASS[et])}
                                title={et === "Payment Plan" ? "This family is on an active payment plan" : "Click to change payment type"}
                              >
                                {et}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="hidden @6xl/students:table-cell px-3 py-3 text-muted-foreground text-xs border-b border-border">
                          {new Date(r.submissionDate).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-3 border-b border-border">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => { setEditRow(r); setEditDraft({ ...r }); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="Contact">
                                  <Mail className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-border">
                                <DropdownMenuLabel>{r.parentName || "Parent"}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {r.parentEmail && (
                                  <DropdownMenuItem asChild>
                                    <a href={`mailto:${r.parentEmail}`}><Mail className="h-4 w-4 mr-2" /> Email {r.parentEmail}</a>
                                  </DropdownMenuItem>
                                )}
                                {r.parentPhone && (
                                  <DropdownMenuItem asChild>
                                    <a href={`tel:${r.parentPhone}`}><Phone className="h-4 w-4 mr-2" /> Call {r.parentPhone}</a>
                                  </DropdownMenuItem>
                                )}
                                {r.parentPhone && (
                                  <DropdownMenuItem asChild>
                                    <a href={`sms:${r.parentPhone}`}><Send className="h-4 w-4 mr-2" /> Text {r.parentPhone}</a>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="More actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-border w-56">
                                {r.status !== "Confirmed" && (
                                  <>
                                    <DropdownMenuItem onClick={() => { updateStudent(r.id, { status: "Confirmed" }); toast.success(`${r.studentName} confirmed`); }}>
                                      <BadgeCheck className="h-4 w-4 mr-2 text-emerald-400" /> Mark Confirmed
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => { setNotesRow(r); setNotesDraft(r.notes || ""); }}>
                                  <StickyNote className="h-4 w-4 mr-2" /> Internal Notes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPlanAnchor(r)}>
                                  <Wallet className="h-4 w-4 mr-2" /> Payment History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setReceiptOpen([r])}>
                                  <FileText className="h-4 w-4 mr-2" /> Generate Receipt
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => downloadReceipt(r, settings.receipt)}>
                                  <Download className="h-4 w-4 mr-2" /> Download PDF
                                </DropdownMenuItem>
                                {r.status === "Confirmed" && (
                                  <DropdownMenuItem onClick={() => setConfirmLetterRow(r)}>
                                    <MailCheck className="h-4 w-4 mr-2 text-emerald-400" /> Confirmation Letter
                                  </DropdownMenuItem>
                                )}
                                {r.formId === "6503623" && (
                                  <DropdownMenuItem
                                    onClick={() => setCommsRow(r)}
                                    disabled={r.paymentStatus !== "Received" || !r.parentEmail}
                                    title={
                                      r.paymentStatus !== "Received"
                                        ? "Payment must be marked as received before this confirmation can be sent."
                                        : !r.parentEmail
                                        ? "Parent email is missing."
                                        : undefined
                                    }
                                  >
                                    <Send className="h-4 w-4 mr-2 text-primary" /> Send Confirmation
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link to="/archive">
                                    <Archive className="h-4 w-4 mr-2" /> Archive (Season)
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeleteRow(r)}
                                  className="text-red-400 focus:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete Student
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={r.id + "-expand"} className={cn(tint)}>
                          <td colSpan={8} className="border-b border-border bg-muted/10 px-4 py-4">
                            <ExpandedRow
                              r={r}
                              et={et}
                              onEdit={() => { setEditRow(r); setEditDraft({ ...r }); }}
                              onNotes={() => { setNotesRow(r); setNotesDraft(r.notes || ""); }}
                              onPayHistory={() => setPlanAnchor(r)}
                              onReceipt={() => setReceiptOpen([r])}
                              onDelete={() => setDeleteRow(r)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Floating bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-xl">
            <span className="text-xs font-medium pl-2 pr-1 tabular-nums">
              {selected.size} selected
            </span>
            <div className="h-5 w-px bg-border mx-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 text-xs">Change Status</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border">
                {STATUSES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => bulkSetStatus(s)}>{s}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 text-xs">Payment Status</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border">
                {PAYMENTS.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => bulkSetPaymentStatus(p)}>{p}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 text-xs">Payment Type</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border">
                {PAYMENT_TYPES.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => bulkSetPaymentType(p)}>{p}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={bulkSendReminder}>
              <Send className="h-3.5 w-3.5 mr-1" /> Reminder
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={bulkExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={bulkMarkReviewed}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Reviewed
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={bulkReceipts}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Receipts
            </Button>
            <div className="h-5 w-px bg-border mx-1" />
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Row detail panel */}
      <Sheet open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <SheetContent className="bg-card border-border w-full sm:max-w-md overflow-y-auto">
          {openRow && (
            <>
              <SheetHeader>
                <SheetTitle>{openRow.studentName}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={openRow.status} />
                  {openRow.alertFlag && <Badge variant="destructive">Alert</Badge>}
                  {openRow.duplicateFlag && <Badge className="bg-primary/15 text-primary border-primary/30">Duplicate</Badge>}
                </div>
                <Field label="Grade" value={openRow.grade} />
                <Field label="School" value={openRow.schoolName} />
                <Field label="Stop" value={openRow.stopAddress} />
                <Field label="Parent" value={openRow.parentName} />
                <Field label="Phone" value={openRow.parentPhone} />
                <Field label="Email" value={openRow.parentEmail} />
                <Field label="Parent Address" value={openRow.parentAddress} />
                {openRow.notes && <Field label="Notes" value={openRow.notes} />}
                <Field label="Submitted" value={new Date(openRow.submissionDate).toLocaleString()} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => downloadReceipt(openRow, settings.receipt)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <FileText className="h-4 w-4 mr-2" /> PDF Receipt
                  </Button>
                  <Button variant="secondary" onClick={() => setReceiptOpen([openRow])}>Customize</Button>
                  {openRow.status === "Confirmed" && (
                    <Button variant="secondary" onClick={() => setConfirmLetterRow(openRow)}>
                      <MailCheck className="h-4 w-4 mr-2" /> Confirmation Letter
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Duplicate group panel */}
      <Sheet open={!!activeDupGroup} onOpenChange={(o) => !o && setDupGroupOpen(null)}>
        <SheetContent className="bg-card border-border w-full sm:max-w-2xl overflow-y-auto">
          {activeDupGroup && (
            <>
              <SheetHeader>
                <SheetTitle>Duplicate Review</SheetTitle>
                <p className="text-xs text-muted-foreground">{activeDupGroup.reason}</p>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeDupGroup.rows.map((r) => (
                  <Card key={r.id} className="p-3 bg-background border-border">
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-xs text-muted-foreground mb-2">{r.schoolName} • Grade {r.grade}</div>
                    <div className="text-xs space-y-1">
                      <div>{r.parentName}</div>
                      <div>{r.parentEmail}</div>
                      <div>{r.parentAddress}</div>
                      <div className="text-muted-foreground">Stop: {r.stopAddress}</div>
                      <div className="text-muted-foreground">Submitted {new Date(r.submissionDate).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => { updateStudent(r.id, { duplicateFlag: false }); toast.success("Kept"); }}>Keep</Button>
                      <Button size="sm" variant="destructive" onClick={() => { deleteStudent(r.id); toast.success("Removed"); }}>Remove</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {confirmLetterRow && (
        <ConfirmationLetterModal row={confirmLetterRow} onClose={() => setConfirmLetterRow(null)} />
      )}

      {receiptOpen && (
        <ReceiptModal
          rows={receiptOpen}
          onClose={() => setReceiptOpen(null)}
          onDownloadAll={() => downloadAllReceipts(receiptOpen, settings.receipt)}
        />
      )}

      <Dialog open={!!notesRow} onOpenChange={(o) => !o && setNotesRow(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Notes — {notesRow?.studentName}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Add free-text notes for this student…"
            className="min-h-[160px] bg-background"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesRow(null)}>Cancel</Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => {
                if (notesRow) {
                  updateStudent(notesRow.id, { notes: notesDraft });
                  toast.success("Notes saved");
                }
                setNotesRow(null);
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) { setEditRow(null); setEditDraft(null); } }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student{editDraft ? ` — ${editDraft.studentName}` : ""}</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <EditField label="Student Name" value={editDraft.studentName} onChange={(v) => setEditDraft({ ...editDraft, studentName: v })} />
              <EditField label="Grade" value={editDraft.grade} onChange={(v) => setEditDraft({ ...editDraft, grade: v })} />
              <EditField label="School" value={editDraft.schoolName} onChange={(v) => setEditDraft({ ...editDraft, schoolName: v })} />
              <EditField label="Bus Stop (1st)" value={editDraft.stopAddress} onChange={(v) => setEditDraft({ ...editDraft, stopAddress: v })} />
              <EditField label="Bus Stop (2nd)" value={editDraft.stopAddress2 || ""} onChange={(v) => setEditDraft({ ...editDraft, stopAddress2: v })} />
              <EditField label="Parent Name" value={editDraft.parentName} onChange={(v) => setEditDraft({ ...editDraft, parentName: v })} />
              <EditField label="Phone" value={editDraft.parentPhone} onChange={(v) => setEditDraft({ ...editDraft, parentPhone: v })} />
              <EditField label="Email" value={editDraft.parentEmail} onChange={(v) => setEditDraft({ ...editDraft, parentEmail: v })} />
              <div className="sm:col-span-2">
                <EditField label="Address" value={editDraft.parentAddress} onChange={(v) => setEditDraft({ ...editDraft, parentAddress: v })} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editDraft.status} onValueChange={(v) => setEditDraft({ ...editDraft, status: v as Status })}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Type</Label>
                <Select
                  value={editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")}
                  onValueChange={(v) => setEditDraft({ ...editDraft, paymentType: v as PaymentType, paid: v !== "Unpaid" })}
                >
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")) === "Self Pay" && (
                <>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Round Trip $</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={editDraft.rtAmount ?? 0}
                      onChange={(e) => {
                        const rt = parseFloat(e.target.value) || 0;
                        const ow = editDraft.owAmount ?? 0;
                        setEditDraft({ ...editDraft, rtAmount: rt, amountPaid: rt + ow });
                      }}
                      className="mt-1 bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">One Way $</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={editDraft.owAmount ?? 0}
                      onChange={(e) => {
                        const ow = parseFloat(e.target.value) || 0;
                        const rt = editDraft.rtAmount ?? 0;
                        setEditDraft({ ...editDraft, owAmount: ow, amountPaid: rt + ow });
                      }}
                      className="mt-1 bg-background"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Paid (RT + OW)</Label>
                    <Input
                      type="number" min={0} step="0.01" readOnly
                      value={(editDraft.rtAmount ?? 0) + (editDraft.owAmount ?? 0)}
                      className="mt-1 bg-muted"
                    />
                  </div>
                </>
              )}
              {(editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")) === "Financial Aid" && (
                <>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Family Paid</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={editDraft.familyPaid ?? 0}
                      onChange={(e) => setEditDraft({ ...editDraft, familyPaid: parseFloat(e.target.value) || 0 })}
                      className="mt-1 bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">School Owes</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={editDraft.schoolOwes ?? 0}
                      onChange={(e) => setEditDraft({ ...editDraft, schoolOwes: parseFloat(e.target.value) || 0 })}
                      className="mt-1 bg-background"
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                    <Checkbox
                      checked={!!editDraft.schoolPaidReceived}
                      onCheckedChange={(v) => setEditDraft({ ...editDraft, schoolPaidReceived: !!v })}
                    />
                    <Label className="text-xs">School portion received</Label>
                  </div>
                  {editDraft.schoolPaidReceived && (
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">School Paid Amount</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={editDraft.schoolPaidAmount ?? 0}
                        onChange={(e) => setEditDraft({ ...editDraft, schoolPaidAmount: parseFloat(e.target.value) || 0 })}
                        className="mt-1 bg-background"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Financial Aid Details</Label>
                    <Input
                      value={editDraft.financialAidNotes || ""}
                      onChange={(e) => setEditDraft({ ...editDraft, financialAidNotes: e.target.value })}
                      placeholder="e.g. Hopkins covering full tuition"
                      className="mt-1 bg-background"
                    />
                  </div>
                </>
              )}
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Status</Label>
                <Select value={editDraft.paymentStatus || "Pending"} onValueChange={(v) => setEditDraft({ ...editDraft, paymentStatus: v as PaymentStatus })}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea
                  value={editDraft.notes || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                  className="mt-1 bg-background min-h-[80px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditRow(null); setEditDraft(null); }}>Cancel</Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => {
                if (editRow && editDraft) {
                  updateStudent(editRow.id, editDraft);
                  toast.success("Student updated");
                }
                setEditRow(null);
                setEditDraft(null);
              }}
            >Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this student?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium text-foreground">{deleteRow?.studentName}</span> from the roster. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteRow) {
                  deleteStudent(deleteRow.id);
                  toast.success(`Deleted ${deleteRow.studentName}`);
                }
                setDeleteRow(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentPlanDrawer
        open={!!planAnchor}
        onOpenChange={(o) => !o && setPlanAnchor(null)}
        anchor={planAnchor}
        students={students}
      />

      <CommunicationPreviewModal
        student={commsRow}
        open={!!commsRow}
        onClose={() => setCommsRow(null)}
        onSent={() => setCommsRefresh((n) => n + 1)}
      />
    </>
  );
}

function ExpandedRow({
  r, et,
  onEdit, onNotes, onPayHistory, onReceipt, onDelete,
}: {
  r: StudentRow;
  et: string;
  onEdit: () => void;
  onNotes: () => void;
  onPayHistory: () => void;
  onReceipt: () => void;
  onDelete: () => void;
}) {
  const isAid = r.paymentType === "Financial Aid";
  // Financial Aid students: Balance = School Owes - School Payments Received
  // (synced with the Financial Aid page; does NOT subtract Family Paid).
  // Self Pay / Unpaid students keep the existing RT+OW - Paid calculation.
  const balance = isAid
    ? Math.max(0, (r.schoolOwes ?? 0) - (r.schoolPaidAmount ?? 0))
    : Math.max(0, (r.rtAmount ?? 0) + (r.owAmount ?? 0) - (r.amountPaid ?? 0));
  return (
    <div
      className="grid gap-4 text-sm"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
    >
      <div>
        <SectionTitle>Student</SectionTitle>
        <MiniField label="Name" value={r.studentName} />
        <MiniField label="Grade" value={r.grade} />
        <MiniField label="School" value={r.schoolName} />
        <MiniField label="Status" value={r.status} />
      </div>
      <div>
        <SectionTitle>Parent</SectionTitle>
        <MiniField label="Name" value={r.parentName} />
        <MiniField label="Phone" value={r.parentPhone} />
        <MiniField label="Email" value={r.parentEmail} />
        <MiniField label="Address" value={r.parentAddress} />
      </div>
      <div>
        <SectionTitle>Payment</SectionTitle>
        <MiniField label="Type" value={et} />
        <MiniField label="Status" value={r.paymentStatus || "Pending"} />
        {isAid ? (
          <>
            <MiniField label="Total Bus Cost" value={formatCurrency((r.familyPaid ?? 0) + (r.schoolOwes ?? 0))} />
            <MiniField label="Family Paid" value={formatCurrency(r.familyPaid ?? 0)} />
            <MiniField label="School Paid" value={formatCurrency(r.schoolPaidAmount ?? 0)} />
            <MiniField label="School Balance" value={formatCurrency(balance)} />
            <MiniField label="Total Collected" value={formatCurrency((r.familyPaid ?? 0) + (r.schoolPaidAmount ?? 0))} />
          </>
        ) : (
          <>
            <MiniField label="RT / OW" value={`${formatCurrency(r.rtAmount ?? 0)} / ${formatCurrency(r.owAmount ?? 0)}`} />
            <MiniField label="Paid" value={formatCurrency(r.amountPaid ?? 0)} />
            <MiniField label="Balance" value={formatCurrency(balance)} />
          </>
        )}
      </div>
      <div>
        <SectionTitle>Route & Registration</SectionTitle>
        <MiniField label="Stop (1st)" value={r.stopAddress || "—"} />
        <MiniField label="Stop (2nd)" value={r.stopAddress2 || "—"} />
        <MiniField label="Submitted" value={new Date(r.submissionDate).toLocaleString()} />
        {r.checkNumber && <MiniField label="Check #" value={r.checkNumber} />}
      </div>
      {r.notes && (
        <div style={{ gridColumn: "1 / -1" }}>
          <SectionTitle>Internal Notes</SectionTitle>
          <div className="rounded-md border border-border bg-background/60 p-3 text-xs whitespace-pre-wrap break-words">{r.notes}</div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1" style={{ gridColumn: "1 / -1" }}>
        <Button size="sm" variant="secondary" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit Student</Button>
        <Button size="sm" variant="secondary" onClick={onPayHistory}><Wallet className="h-3.5 w-3.5 mr-1" /> Payment History</Button>
        <Button size="sm" variant="secondary" onClick={onReceipt}><FileText className="h-3.5 w-3.5 mr-1" /> Generate Receipt</Button>
        <Button size="sm" variant="secondary" onClick={onNotes}><StickyNote className="h-3.5 w-3.5 mr-1" /> Internal Notes</Button>
        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-400" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">{children}</div>;
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-b-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right break-words min-w-0" title={value}>{value || "—"}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 bg-background" />
    </div>
  );
}
