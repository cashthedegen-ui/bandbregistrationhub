import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CalendarClock, CreditCard, DollarSign, Filter, Search, TrendingUp, Users, Wallet } from "lucide-react";
import { fetchAllPlans, type PaymentPlan, type PlanStatus, familyKeyOf } from "@/lib/payment-plans";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PaymentPlanDrawer } from "@/components/payment-plan-drawer";
import type { StudentRow } from "@/lib/types";

export const Route = createFileRoute("/_app/payments")({
  head: () => ({ meta: [{ title: "Payment Plans — B & B Transit" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
  }),
  component: PaymentsPage,
});


const BADGE: Record<PlanStatus, string> = {
  Current: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Upcoming: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
  "Paid Off": "bg-primary/15 text-primary border-primary/30",
  Cancelled: "bg-muted text-muted-foreground border-border",
  "Removed by Admin": "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

const ACTIVE_STATUSES: PlanStatus[] = ["Current", "Upcoming", "Overdue"];
const INACTIVE_STATUSES: PlanStatus[] = ["Cancelled", "Removed by Admin"];

function PaymentsPage() {
  const { students } = useStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [school, setSchool] = useState<string>("all");
  const [drawerAnchor, setDrawerAnchor] = useState<StudentRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchAllPlans().then(setPlans).catch(console.error).finally(() => setLoading(false));
  }, [reloadKey]);

  const schools = useMemo(() => Array.from(new Set(plans.map((p) => p.school_name).filter(Boolean))), [plans]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return plans.filter((p) => {
      if (status === "active" && !ACTIVE_STATUSES.includes(p.status)) return false;
      else if (status === "inactive" && !INACTIVE_STATUSES.includes(p.status)) return false;
      else if (status !== "all" && status !== "active" && status !== "inactive" && p.status !== status) return false;
      if (school !== "all" && p.school_name !== school) return false;
      if (qq && !`${p.parent_name} ${p.parent_email} ${p.student_names} ${p.school_name}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [plans, q, status, school]);

  const kpis = useMemo(() => {
    const live = plans.filter((p) => !INACTIVE_STATUSES.includes(p.status));
    const active = live.filter((p) => p.status !== "Paid Off");
    const outstanding = active.reduce((s, p) => s + Number(p.remaining_balance), 0);
    const totalTarget = live.reduce((s, p) => s + Number(p.total_amount), 0);
    const totalPaid = live.reduce((s, p) => s + Number(p.amount_paid), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
    const dueWeek = active.filter((p) => p.next_due_date && new Date(p.next_due_date + "T00:00:00") >= today && new Date(p.next_due_date + "T00:00:00") <= weekOut);
    const overdue = live.filter((p) => p.status === "Overdue");
    const collectionRate = totalTarget > 0 ? (totalPaid / totalTarget) * 100 : 0;
    return { active: active.length, outstanding, dueWeek: dueWeek.length, overdue: overdue.length, collectionRate };
  }, [plans]);

  const openPlan = (p: PaymentPlan) => {
    // Find a student row that belongs to this family to anchor the drawer.
    const anchor = students.find((s) => familyKeyOf(s) === p.family_key)
      ?? ({
        id: "synthetic", submissionId: "", formId: "", schoolName: p.school_name,
        studentName: p.student_names.split(",")[0] || p.parent_name, grade: "", stopAddress: "",
        parentName: p.parent_name, parentPhone: p.parent_phone, parentEmail: p.parent_email,
        parentAddress: "", notes: "", alertFlag: false, duplicateFlag: false, status: "Reviewed",
        paymentStatus: "Pending", submissionDate: new Date().toISOString(),
      } as StudentRow);
    setDrawerAnchor(anchor);
  };

  return (
    <>
      <PageHeader title="Payment Plans" subtitle="Installment plans for families opted into the Payment Plan workflow." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Kpi label="Active Plans" value={formatNumber(kpis.active)} icon={Users} />
        <Kpi label="Outstanding Balance" value={formatCurrency(kpis.outstanding)} icon={Wallet} />
        <Kpi label="Due This Week" value={formatNumber(kpis.dueWeek)} icon={CalendarClock} />
        <Kpi label="Overdue" value={formatNumber(kpis.overdue)} icon={AlertTriangle} tone="red" />
        <Kpi label="Collection Rate" value={`${kpis.collectionRate.toFixed(0)}%`} icon={TrendingUp} />
      </div>

      <Card className="bg-card border-border p-3 mt-6 mb-4">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search families, students, emails…" className="pl-9 bg-background" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-36 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active (Current + Upcoming + Overdue)</SelectItem>
              <SelectItem value="Current">Current</SelectItem>
              <SelectItem value="Upcoming">Upcoming</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
              <SelectItem value="Paid Off">Paid Off</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
              <SelectItem value="Removed by Admin">Removed by Admin</SelectItem>
              <SelectItem value="inactive">All Cancelled / Removed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="w-full md:w-44 bg-background"><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card className="bg-card border-border p-10 text-center text-sm text-muted-foreground">Loading payment plans…</Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-border p-10 text-center">
          <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground mb-1">No payment plans match these filters.</div>
          <div className="text-xs text-muted-foreground">Create a plan from the Students tab by clicking the wallet icon on any family.</div>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left">Family</th>
                  <th className="px-3 py-3 text-left">School</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-right">Remaining</th>
                  <th className="px-3 py-3 text-left">Progress</th>
                  <th className="px-3 py-3 text-left">Next Due</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const pct = Number(p.total_amount) > 0 ? (Number(p.amount_paid) / Number(p.total_amount)) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openPlan(p)}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{p.parent_name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{p.student_names}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.school_name}</td>
                      <td className="px-3 py-2.5"><Badge className={`border ${BADGE[p.status]}`}>{p.status}</Badge></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(p.total_amount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{formatCurrency(p.amount_paid)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-yellow-300">{formatCurrency(p.remaining_balance)}</td>
                      <td className="px-3 py-2.5 w-44"><Progress value={Math.min(100, pct)} className="h-2" /></td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.next_due_date ? new Date(p.next_due_date + "T00:00:00").toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openPlan(p); }}>
                          <CreditCard className="h-4 w-4 mr-1" /> Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PaymentPlanDrawer
        open={!!drawerAnchor}
        onOpenChange={(o) => !o && setDrawerAnchor(null)}
        anchor={drawerAnchor}
        students={students}
        onPlanChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone?: "red" }) {
  return (
    <Card className="bg-card border-border">
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
