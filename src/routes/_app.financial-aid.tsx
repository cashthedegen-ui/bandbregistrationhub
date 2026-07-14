import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import XLSX from "xlsx-js-style";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  HandHeart, Users, DollarSign, School, TrendingUp, Wallet, Search, Filter, Download,
  FileSpreadsheet, ClipboardList, ArrowUpDown, Trash2, ArrowRightLeft,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { familyKeyOf } from "@/lib/payment-plans";
import {
  isFinancialAid, totalsForStudent, logFinancialAidHistory,
  fetchHistoryForStudent, type FinancialAidHistoryEntry,
} from "@/lib/financial-aid";
import type { StudentRow, PaymentStatus, PaymentType, Status } from "@/lib/types";

export const Route = createFileRoute("/_app/financial-aid")({
  head: () => ({ meta: [{ title: "Financial Aid — B & B Transit" }] }),
  component: FinancialAidPage,
});

const PAYMENT_STATUSES: PaymentStatus[] = ["Pending", "Received", "Overdue"];
const REG_STATUSES: Status[] = ["New", "Reviewed", "Confirmed", "Waitlisted"];

type KpiKey = "all" | "outstanding" | "collected";

function FinancialAidPage() {
  const { students, updateStudent } = useStore();
  const [q, setQ] = useState("");
  const [qParent, setQParent] = useState("");
  const [school, setSchool] = useState("all");
  const [grade, setGrade] = useState("all");
  const [regStatus, setRegStatus] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
  const [sortByOutstanding, setSortByOutstanding] = useState(true);
  const [kpiFilter, setKpiFilter] = useState<KpiKey>("all");
  const [selected, setSelected] = useState<StudentRow | null>(null);

  const faStudents = useMemo(() => students.filter(isFinancialAid), [students]);

  const schools = useMemo(() => Array.from(new Set(faStudents.map((s) => s.schoolName).filter(Boolean))).sort(), [faStudents]);
  const grades = useMemo(() => Array.from(new Set(faStudents.map((s) => s.grade).filter(Boolean))).sort(), [faStudents]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    const pq = qParent.toLowerCase();
    return faStudents.filter((s) => {
      if (qq && !s.studentName.toLowerCase().includes(qq)) return false;
      if (pq && !s.parentName.toLowerCase().includes(pq)) return false;
      if (school !== "all" && s.schoolName !== school) return false;
      if (grade !== "all" && s.grade !== grade) return false;
      if (regStatus !== "all" && s.status !== regStatus) return false;
      if (payStatus !== "all" && s.paymentStatus !== payStatus) return false;
      const t = totalsForStudent(s);
      if (kpiFilter === "outstanding" && t.outstanding <= 0) return false;
      if (kpiFilter === "collected" && t.amountCollected <= 0) return false;
      return true;
    });
  }, [faStudents, q, qParent, school, grade, regStatus, payStatus, kpiFilter]);

  const kpis = useMemo(() => {
    let totalBusCost = 0, familyPaid = 0, collected = 0, outstandingSchool = 0;
    const schoolSet = new Set<string>();
    faStudents.forEach((s) => {
      const t = totalsForStudent(s);
      totalBusCost += t.totalBusCost;
      familyPaid += t.familyPaid;
      collected += t.collected;
      outstandingSchool += t.schoolBalance;
      if (s.schoolName) schoolSet.add(s.schoolName);
    });
    return {
      count: faStudents.length, totalBusCost, familyPaid, collected, outstandingSchool, schools: schoolSet.size,
    };
  }, [faStudents]);

  const schoolSummary = useMemo(() => {
    const map = new Map<string, { school: string; students: number; totalBusCost: number; familyPaid: number; schoolPaid: number; collected: number; outstanding: number }>();
    faStudents.forEach((s) => {
      const key = s.schoolName || "—";
      const t = totalsForStudent(s);
      const row = map.get(key) ?? { school: key, students: 0, totalBusCost: 0, familyPaid: 0, schoolPaid: 0, collected: 0, outstanding: 0 };
      row.students += 1;
      row.totalBusCost += t.totalBusCost;
      row.familyPaid += t.familyPaid;
      row.schoolPaid += t.schoolPaid;
      row.collected += t.collected;
      row.outstanding += t.schoolBalance;
      map.set(key, row);
    });
    const rows = Array.from(map.values());
    rows.sort((a, b) => sortByOutstanding ? b.outstanding - a.outstanding : a.school.localeCompare(b.school));
    return rows;
  }, [faStudents, sortByOutstanding]);

  const displayed = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ao = totalsForStudent(a).outstanding;
      const bo = totalsForStudent(b).outstanding;
      return bo - ao;
    });
  }, [filtered]);

  const exportExcel = () => {
    const rows = displayed.map((s) => {
      const t = totalsForStudent(s);
      return {
        Student: s.studentName,
        Parent: s.parentName,
        School: s.schoolName,
        Grade: s.grade,
        "Award Amount": t.awardAmount,
        "Family Responsibility": t.familyResponsibility,
        "School Balance": t.schoolBalance,
        "Amount Collected": t.amountCollected,
        "Outstanding": t.outstanding,
        "Payment Status": s.paymentStatus,
        "Registration Status": s.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Aid");
    XLSX.writeFile(wb, "BB_Transit_Financial_Aid.xlsx");
  };

  return (
    <>
      <PageHeader
        title="Financial Aid"
        subtitle="Manage students receiving Financial Aid — separate from live revenue analytics."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export to Excel
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Students on Financial Aid" value={formatNumber(kpis.count)} icon={Users}
          active={kpiFilter === "all"} onClick={() => setKpiFilter("all")} />
        <Kpi label="Total Bus Cost" value={formatCurrency(kpis.totalBusCost)} icon={HandHeart}
          active={false} onClick={() => setKpiFilter("all")} />
        <Kpi label="Total Family Paid" value={formatCurrency(kpis.familyPaid)} icon={DollarSign}
          active={false} onClick={() => setKpiFilter("all")} />
        <Kpi label="Total Collected" value={formatCurrency(kpis.collected)} icon={TrendingUp}
          active={kpiFilter === "collected"} onClick={() => setKpiFilter("collected")} />
        <Kpi label="Outstanding School Balance" value={formatCurrency(kpis.outstandingSchool)} icon={Wallet}
          tone="red" active={kpiFilter === "outstanding"} onClick={() => setKpiFilter("outstanding")} />
        <Kpi label="Schools Participating" value={formatNumber(kpis.schools)} icon={School}
          active={false} onClick={() => setKpiFilter("all")} />
      </div>

      {/* School Summary */}
      <Card className="bg-card border-border mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <School className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">School Summary</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSortByOutstanding((v) => !v)}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              {sortByOutstanding ? "Sorting by Outstanding" : "Sorting by School"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">School</th>
                  <th className="px-3 py-2.5 text-right">Students</th>
                  <th className="px-3 py-2.5 text-right">Total Bus Cost</th>
                  <th className="px-3 py-2.5 text-right">Family Paid</th>
                  <th className="px-3 py-2.5 text-right">School Payments</th>
                  <th className="px-3 py-2.5 text-right">Total Collected</th>
                  <th className="px-3 py-2.5 text-right">Outstanding Bal.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schoolSummary.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No financial aid students yet.</td></tr>
                ) : schoolSummary.map((r) => (
                  <tr key={r.school} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{r.school}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.students}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.totalBusCost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.familyPaid)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.schoolPaid)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{formatCurrency(r.collected)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-300">{formatCurrency(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="bg-card border-border p-3 mt-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student…" className="pl-9 bg-background" />
          </div>
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={qParent} onChange={(e) => setQParent(e.target.value)} placeholder="Search parent…" className="pl-9 bg-background" />
          </div>
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={regStatus} onValueChange={setRegStatus}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Reg status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reg status</SelectItem>
              {REG_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={payStatus} onValueChange={setPayStatus}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Payment status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment status</SelectItem>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      {displayed.length === 0 ? (
        <Card className="bg-card border-border p-10 text-center">
          <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground mb-1">No Financial Aid students match these filters.</div>
          <div className="text-xs text-muted-foreground">
            Students appear here after their payment type is set to <b>Financial Aid</b> on the Students page.
          </div>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left">Student</th>
                  <th className="px-3 py-3 text-left">Parent</th>
                  <th className="px-3 py-3 text-left">School</th>
                  <th className="px-3 py-3 text-left">Grade</th>
                  <th className="px-3 py-3 text-right">Total Bus Cost</th>
                  <th className="px-3 py-3 text-right">Family Paid</th>
                  <th className="px-3 py-3 text-right">School Balance</th>
                  <th className="px-3 py-3 text-right">Collected</th>
                  <th className="px-3 py-3 text-left">Payment Status</th>
                  <th className="px-3 py-3 text-left">Reg. Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayed.map((s) => {
                  const t = totalsForStudent(s);
                  const badgeTone = t.paymentStatus === "Paid" ? "text-emerald-300 border-emerald-500/40"
                    : t.paymentStatus === "Partially Paid" ? "text-yellow-300 border-yellow-500/40"
                    : "text-red-300 border-red-500/40";
                  return (
                    <tr key={s.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(s)}>
                      <td className="px-3 py-2.5 font-medium">{s.studentName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{s.parentName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{s.schoolName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{s.grade || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(t.totalBusCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(t.familyPaid)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-300">{formatCurrency(t.schoolBalance)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{formatCurrency(t.collected)}</td>
                      <td className="px-3 py-2.5"><Badge variant="outline" className={badgeTone}>{t.paymentStatus}</Badge></td>
                      <td className="px-3 py-2.5"><Badge variant="outline">{s.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <FinancialAidDrawer
        student={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onSave={(patch, action, notes) => {
          if (!selected) return;
          const prev: Record<string, unknown> = {};
          Object.keys(patch).forEach((k) => { (prev as any)[k] = (selected as any)[k]; });
          updateStudent(selected.id, patch);
          logFinancialAidHistory({
            student_id: selected.id,
            family_key: familyKeyOf(selected),
            action,
            previous_values: prev,
            new_values: patch as any,
            notes,
          });
          setSelected({ ...selected, ...patch });
          toast.success("Financial Aid record updated");
        }}
        onRemove={(newType, notes) => {
          if (!selected) return;
          const prev = {
            paymentType: selected.paymentType,
            familyPaid: selected.familyPaid,
            schoolOwes: selected.schoolOwes,
            schoolPaidReceived: selected.schoolPaidReceived,
            schoolPaidAmount: selected.schoolPaidAmount,
            amountPaid: selected.amountPaid,
            financialAidNotes: selected.financialAidNotes,
          };
          const patch: Partial<StudentRow> = {
            paymentType: newType,
          };
          if (newType === "Unpaid") {
            patch.paid = false;
          }
          updateStudent(selected.id, patch);
          logFinancialAidHistory({
            student_id: selected.id,
            family_key: familyKeyOf(selected),
            action: `Removed from Financial Aid → ${newType}`,
            previous_values: prev,
            new_values: patch as any,
            notes,
          });
          toast.success(`Moved to ${newType}. History preserved.`);
          setSelected(null);
        }}
      />
    </>
  );
}

function Kpi({ label, value, icon: Icon, tone, active, onClick }:
  { label: string; value: string | number; icon: any; tone?: "red"; active?: boolean; onClick?: () => void }) {
  return (
    <Card
      onClick={onClick}
      className={`bg-card border-border cursor-pointer transition-colors ${active ? "border-primary/60 ring-1 ring-primary/30" : "hover:border-primary/40"}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${tone === "red" ? "text-red-300" : ""}`}>{value}</div>
          </div>
          <div className={`h-9 w-9 rounded-md flex items-center justify-center ${tone === "red" ? "bg-red-500/10 text-red-300" : "bg-primary/10 text-primary"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------ Drawer ------------------

function FinancialAidDrawer({
  student, onOpenChange, onSave, onRemove,
}: {
  student: StudentRow | null;
  onOpenChange: (o: boolean) => void;
  onSave: (patch: Partial<StudentRow>, action: string, notes?: string) => void;
  onRemove: (newType: PaymentType, notes: string) => void;
}) {
  const [draft, setDraft] = useState<StudentRow | null>(student);
  const [history, setHistory] = useState<FinancialAidHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    setDraft(student);
    if (student) {
      setHistoryLoading(true);
      fetchHistoryForStudent(student.id)
        .then(setHistory)
        .catch((e) => console.error(e))
        .finally(() => setHistoryLoading(false));
    } else {
      setHistory([]);
    }
  }, [student?.id]);

  if (!draft) return null;
  const t = totalsForStudent(draft);

  const setF = <K extends keyof StudentRow>(k: K, v: StudentRow[K]) => setDraft({ ...draft, [k]: v });

  const commit = (patch: Partial<StudentRow>, action: string, notes?: string) => {
    onSave(patch, action, notes);
  };

  return (
    <>
      <Sheet open={!!student} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HandHeart className="h-5 w-5 text-primary" />
              {draft.studentName}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {/* Info */}
            <Card className="bg-muted/20 border-border">
              <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Parent" value={draft.parentName} />
                <InfoRow label="Email" value={draft.parentEmail || "—"} />
                <InfoRow label="Phone" value={draft.parentPhone || "—"} />
                <InfoRow label="School" value={draft.schoolName || "—"} />
                <InfoRow label="Grade" value={draft.grade || "—"} />
                <InfoRow label="Reg Status" value={draft.status} />
              </CardContent>
            </Card>

            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Award" value={formatCurrency(t.awardAmount)} />
              <MiniStat label="Collected" value={formatCurrency(t.amountCollected)} tone="emerald" />
              <MiniStat label="School Balance" value={formatCurrency(t.schoolBalance)} tone="red" />
              <MiniStat label="Outstanding" value={formatCurrency(t.outstanding)} tone="yellow" />
            </div>

            {/* Edit fields */}
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Financial Aid Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Family Responsibility">
                    <Input type="number" step="0.01" value={draft.familyPaid ?? 0}
                      onChange={(e) => setF("familyPaid", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="School Balance (Award)">
                    <Input type="number" step="0.01" value={draft.schoolOwes ?? 0}
                      onChange={(e) => setF("schoolOwes", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="Amount Collected (Family)">
                    <Input type="number" step="0.01" value={draft.amountPaid ?? 0}
                      onChange={(e) => setF("amountPaid", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="School Paid Amount">
                    <Input type="number" step="0.01" value={draft.schoolPaidAmount ?? 0}
                      onChange={(e) => setF("schoolPaidAmount", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="Payment Status">
                    <Select value={draft.paymentStatus} onValueChange={(v) => setF("paymentStatus", v as PaymentStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Registration Status">
                    <Select value={draft.status} onValueChange={(v) => setF("status", v as Status)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REG_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!draft.schoolPaidReceived}
                    onCheckedChange={(v) => setF("schoolPaidReceived", !!v)}
                    id="school-paid"
                  />
                  <Label htmlFor="school-paid" className="text-sm">School payment received</Label>
                </div>
                <Field label="Internal Notes">
                  <Textarea rows={3} value={draft.financialAidNotes ?? ""}
                    onChange={(e) => setF("financialAidNotes", e.target.value)} />
                </Field>
                <div className="flex justify-end">
                  <Button
                    onClick={() => commit({
                      familyPaid: draft.familyPaid, schoolOwes: draft.schoolOwes,
                      amountPaid: draft.amountPaid, schoolPaidAmount: draft.schoolPaidAmount,
                      schoolPaidReceived: draft.schoolPaidReceived, paymentStatus: draft.paymentStatus,
                      status: draft.status, financialAidNotes: draft.financialAidNotes,
                    }, "Updated Financial Aid details")}
                  >
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-orange-300" /> Move / Remove
                </h3>
                <p className="text-xs text-muted-foreground">
                  Move this student out of Financial Aid. History is preserved — no records are deleted.
                </p>
                <Button variant="outline" onClick={() => setRemoveOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5 text-red-300" /> Remove from Financial Aid
                </Button>
              </CardContent>
            </Card>

            {/* History */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <ClipboardList className="h-4 w-4 text-primary" /> Financial Aid History
                </h3>
                {historyLoading ? (
                  <div className="text-xs text-muted-foreground">Loading history…</div>
                ) : history.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No history entries yet.</div>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {history.map((h) => (
                      <li key={h.id} className="border border-border rounded-md p-2 bg-muted/10">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{h.action}</span>
                          <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {h.actor_name || h.actor_email || "Staff"}
                        </div>
                        {h.notes && <div className="mt-1 text-foreground/80">{h.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <RemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={(newType, notes) => {
          setRemoveOpen(false);
          onRemove(newType, notes);
        }}
      />
    </>
  );
}

function RemoveDialog({ open, onOpenChange, onConfirm }:
  { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (newType: PaymentType, notes: string) => void }) {
  const [newType, setNewType] = useState<PaymentType>("Unpaid");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove from Financial Aid</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The student's historical Financial Aid values will be preserved in the history log.
            Select where they should move to.
          </p>
          <Field label="Move to">
            <Select value={newType} onValueChange={(v) => setNewType(v as PaymentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Self Pay">Paid in Full / Self Pay</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Admin note (required)">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for removal…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={notes.trim().length === 0}
            onClick={() => onConfirm(newType, notes.trim())}
          >
            Confirm Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" | "yellow" }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : tone === "yellow" ? "text-yellow-300" : "";
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
