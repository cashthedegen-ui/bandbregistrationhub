import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertTriangle, Bell, CalendarClock, CheckCircle2, Clock, Copy, DollarSign, FileSpreadsheet,
  HandHeart, Mail, MessageSquare, RefreshCw, Server, TrendingUp, UserPlus, Users, Wallet, XCircle,
} from "lucide-react";
import { exportMaster } from "@/lib/excel";
import { stopKey } from "@/lib/storage";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { fetchAllPlans, fetchAllPaymentRecords, familyKeyOf, type PaymentPlan, type PaymentRecord } from "@/lib/payment-plans";
import { fetchAuditLog, type AuditEntry } from "@/lib/audit-log";
import { computeFinancialSummary } from "@/lib/financial-summary";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — B & B Transit" }] }),
  component: Dashboard,
});

type LinkTo = { to: string; search?: Record<string, unknown>; hash?: string };

function Kpi({
  label, value, icon: Icon, hint, link, tone,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
  link?: LinkTo;
  tone?: "red" | "yellow" | "emerald";
}) {
  const toneCls =
    tone === "red" ? "text-red-300" :
    tone === "yellow" ? "text-yellow-300" :
    tone === "emerald" ? "text-emerald-300" : "";
  const iconTone =
    tone === "red" ? "bg-red-500/10 text-red-300" :
    tone === "yellow" ? "bg-yellow-500/10 text-yellow-300" :
    tone === "emerald" ? "bg-emerald-500/10 text-emerald-300" : "bg-primary/10 text-primary";

  const body = (
    <Card className={cn(
      "bg-card border-border h-full transition-all",
      link && "cursor-pointer hover:border-primary/50 hover:bg-card/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5",
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={cn("mt-2 text-2xl md:text-3xl font-semibold truncate", toneCls)}>{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
          <div className={cn("h-9 w-9 shrink-0 rounded-md flex items-center justify-center", iconTone)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!link) return body;
  return (
    <Link to={link.to as any} search={link.search as any} hash={link.hash} className="block">
      {body}
    </Link>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
      <span className="flex-1">{label}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function Dashboard() {
  const { students, dupGroups, activity, settings, syncAll, syncing, stopCapacities, syncHistory, lastSync } = useStore();
  const formsSynced = settings.forms.filter((f) => f.formId).length;
  const newCount = students.filter((s) => s.status === "New").length;
  const alertCount = students.filter((s) => s.alertFlag).length;
  const waitlisted = students.filter((s) => s.status === "Waitlisted").length;

  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  useEffect(() => {
    fetchAllPlans().then(setPlans).catch(() => {});
    fetchAllPaymentRecords().then(setRecords).catch(() => {});
    fetchAuditLog(25).then(setAudit).catch(() => {});
  }, []);

  const planKpis = useMemo(() => {
    const live = plans.filter((p) => p.status !== "Cancelled" && p.status !== "Removed by Admin");
    const active = live.filter((p) => p.status !== "Paid Off");
    const outstanding = active.reduce((s, p) => s + Number(p.remaining_balance), 0);
    const totalTarget = live.reduce((s, p) => s + Number(p.total_amount), 0);
    const totalPaid = live.reduce((s, p) => s + Number(p.amount_paid), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
    const dueWeek = active.filter((p) => p.next_due_date && new Date(p.next_due_date + "T00:00:00") >= today && new Date(p.next_due_date + "T00:00:00") <= weekOut);
    const overdue = live.filter((p) => p.status === "Overdue");
    const collectionRate = totalTarget > 0 ? (totalPaid / totalTarget) * 100 : 0;
    return { active: active.length, outstanding, dueWeek: dueWeek.length, overdue: overdue.length, collectionRate, hasAny: plans.length > 0 };
  }, [plans]);

  const paymentTotals = useMemo(() => {
    const collected = records.reduce((s, r) => s + Number(r.amount || 0), 0);
    const outstanding = plans
      .filter((p) => p.status !== "Cancelled" && p.status !== "Removed by Admin")
      .reduce((s, p) => s + Number(p.remaining_balance || 0), 0);
    let pending = 0, overdue = 0;
    for (const s of students) {
      if (s.paymentStatus === "Pending") pending++;
      else if (s.paymentStatus === "Overdue") overdue++;
    }
    return { collected, outstanding, pending, overdue };
  }, [records, plans, students]);

  // Shared with the Analytics page — single source of truth for revenue.
  const financials = useMemo(() => computeFinancialSummary(students), [students]);



  const stopCapacityWidget = useMemo(() => {
    const stops = new Map<string, { route: string; addr: string; count: number }>();
    for (const s of students) {
      if (!s.stopAddress) continue;
      const k = stopKey(s.schoolName, s.stopAddress);
      const cur = stops.get(k) || { route: s.schoolName, addr: s.stopAddress, count: 0 };
      cur.count++;
      stops.set(k, cur);
    }
    const withCap: { route: string; addr: string; count: number; cap: number; pct: number }[] = [];
    for (const [k, v] of stops) {
      const cap = stopCapacities[k] || 0;
      if (!cap) continue;
      withCap.push({ ...v, cap, pct: (v.count / cap) * 100 });
    }
    withCap.sort((a, b) => b.pct - a.pct);
    return withCap.slice(0, 3);
  }, [students, stopCapacities]);

  const overdueFamilies = useMemo(
    () => plans.filter((p) => p.status === "Overdue"),
    [plans],
  );

  const notifications = useMemo(() => {
    const items: { id: string; icon: any; tone: string; title: string; detail?: string; link?: LinkTo }[] = [];
    if (overdueFamilies.length > 0) {
      items.push({
        id: "overdue-plans",
        icon: AlertTriangle,
        tone: "text-red-300",
        title: `${overdueFamilies.length} ${overdueFamilies.length === 1 ? "family" : "families"} overdue`,
        link: { to: "/payments", search: { filter: "overdue" } },
      });
    }
    if (dupGroups.length > 0) {
      items.push({
        id: "duplicates",
        icon: Copy,
        tone: "text-primary",
        title: `${dupGroups.length} duplicate ${dupGroups.length === 1 ? "record" : "records"}`,
        link: { to: "/students", search: { duplicates: "1" } },
      });
    }
    if (alertCount > 0) {
      items.push({
        id: "alerts",
        icon: AlertTriangle,
        tone: "text-yellow-300",
        title: `${alertCount} alert ${alertCount === 1 ? "flag" : "flags"} to review`,
        link: { to: "/students", search: { alerts: "1" } },
      });
    }
    for (const s of stopCapacityWidget.filter((x) => x.pct >= 90)) {
      items.push({
        id: `cap-${s.addr}`,
        icon: AlertTriangle,
        tone: s.pct >= 100 ? "text-red-300" : "text-yellow-300",
        title: `${s.addr} at ${Math.round(s.pct)}% capacity`,
        detail: `${s.count}/${s.cap}`,
        link: { to: "/routes" },
      });
    }
    if (planKpis.dueWeek > 0) {
      items.push({
        id: "due-week",
        icon: CalendarClock,
        tone: "text-sky-300",
        title: `${planKpis.dueWeek} payment ${planKpis.dueWeek === 1 ? "plan" : "plans"} due this week`,
        link: { to: "/payments", search: { filter: "due-week" } },
      });
    }
    return items;
  }, [overdueFamilies, dupGroups.length, alertCount, stopCapacityWidget, planKpis.dueWeek]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Operational overview of student registrations across all schools."
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="relative">
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">Notifications</div>
              {notifications.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">All clear. Nothing to review.</div>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                  {notifications.map((n) => {
                    const Icon = n.icon;
                    const row = (
                      <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/30">
                        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", n.tone)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{n.title}</div>
                          {n.detail && <div className="text-[11px] text-muted-foreground">{n.detail}</div>}
                        </div>
                      </div>
                    );
                    return (
                      <li key={n.id}>
                        {n.link ? <Link to={n.link.to as any} search={n.link.search as any}>{row}</Link> : row}
                      </li>
                    );
                  })}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        }
      />

      {/* System Status */}
      <Card className="bg-card border-border mb-6">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Server className="h-4 w-4" /> System Status
          </div>
          <StatusRow label="Database" ok={true} />
          <StatusRow label="Forms" ok={formsSynced > 0} detail={`${formsSynced}/${settings.forms.length}`} />
          <StatusRow label="Email" ok={!!settings.receipt?.companyEmail} />
          <StatusRow label="SMS" ok={false} detail="Not configured" />
          <div className="ml-auto text-xs text-muted-foreground">
            Last sync {lastSync ? new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
          </div>
        </CardContent>
      </Card>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Total Students" value={formatNumber(students.length)} icon={Users} link={{ to: "/students" }} />
        <Kpi label="New Registrations" value={formatNumber(newCount)} icon={UserPlus} link={{ to: "/students", search: { status: "New" } }} />
        <Kpi label="Waitlisted" value={formatNumber(waitlisted)} icon={Clock} link={{ to: "/students", search: { status: "Waitlisted" } }} />
        <Kpi label="Alert Flags" value={formatNumber(alertCount)} icon={AlertTriangle} tone={alertCount > 0 ? "yellow" : undefined} link={{ to: "/students", search: { alerts: "1" } }} />
        <Kpi label="Duplicates" value={formatNumber(dupGroups.length)} icon={Copy} link={{ to: "/students", search: { duplicates: "1" } }} />
        <Kpi label="Forms Synced" value={formatNumber(formsSynced)} icon={RefreshCw} hint={`${settings.forms.length} configured`} link={{ to: "/", hash: "sync-history" }} />
      </div>

      {planKpis.hasAny && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payment Plans</h2>
            <Link to="/payments" className="ml-auto text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Kpi label="Active Plans" value={formatNumber(planKpis.active)} icon={Users} link={{ to: "/payments", search: { filter: "active" } }} />
            <Kpi label="Outstanding" value={formatCurrency(planKpis.outstanding)} icon={Wallet} link={{ to: "/payments", search: { sort: "outstanding" } }} />
            <Kpi label="Due This Week" value={formatNumber(planKpis.dueWeek)} icon={CalendarClock} link={{ to: "/payments", search: { filter: "due-week" } }} />
            <Kpi label="Overdue" value={formatNumber(planKpis.overdue)} icon={AlertTriangle} tone={planKpis.overdue > 0 ? "red" : undefined} link={{ to: "/payments", search: { filter: "overdue" } }} />
            <Kpi label="Collection Rate" value={`${planKpis.collectionRate.toFixed(0)}%`} icon={TrendingUp} link={{ to: "/payments" }} />
          </div>
        </div>
      )}

      {/* Revenue Snapshot */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue Snapshot</h2>
          <Link to="/analytics" className="ml-auto text-xs text-primary hover:underline">Analytics →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi
            label="Cash Collected"
            value={formatCurrency(financials.cashCollected)}
            icon={DollarSign}
            tone="emerald"
            hint="Money already received"
            link={{ to: "/analytics", search: { focus: "collected" } }}
          />
          <Kpi
            label="Outstanding Receivables"
            value={formatCurrency(financials.outstandingReceivables)}
            icon={Wallet}
            tone="yellow"
            hint="Money still owed"
            link={{ to: "/analytics", search: { focus: "receivables" } }}
          />
          <Kpi
            label="Projected Season Revenue"
            value={formatCurrency(financials.projectedSeasonRevenue)}
            icon={TrendingUp}
            hint="Collected plus outstanding"
            link={{ to: "/analytics", search: { focus: "overview" } }}
          />
        </div>
      </div>

      {/* Payments + Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="bg-card border-border lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments</h2>
            </div>
            <div className="space-y-2 text-sm">
              <Link to="/payments" className="block">
                <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 hover:bg-emerald-500/15">
                  <span className="text-emerald-300">Collected Revenue</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(paymentTotals.collected)}</span>
                </div>
              </Link>
              <Link to="/payments" search={{ sort: "outstanding" } as any} className="block">
                <div className="flex items-center justify-between rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 hover:bg-yellow-500/15">
                  <span className="text-yellow-300">Outstanding Revenue</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(paymentTotals.outstanding)}</span>
                </div>
              </Link>
              <Link to="/students" search={{ payment: "Pending" } as any} className="block">
                <div className="flex items-center justify-between rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 hover:bg-sky-500/15">
                  <span className="text-sky-300">Pending Families</span>
                  <span className="font-semibold tabular-nums">{formatNumber(paymentTotals.pending)}</span>
                </div>
              </Link>
              <Link to="/students" search={{ payment: "Overdue" } as any} className="block">
                <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 hover:bg-red-500/15">
                  <span className="text-red-300">Overdue Families</span>
                  <span className="font-semibold tabular-nums">{formatNumber(paymentTotals.overdue)}</span>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Stop Capacity</h2>
              <Link to="/routes" className="text-xs text-primary hover:underline">Manage routes →</Link>
            </div>
            {stopCapacityWidget.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No stop capacities set yet. Configure limits on the Routes tab to enable capacity alerts.</div>
            ) : (
              <ul className="space-y-2">
                {stopCapacityWidget.map((s, i) => {
                  const pct = Math.min(999, Math.round(s.pct));
                  const level = s.pct >= 100 ? "full" : s.pct >= 90 ? "warn" : "ok";
                  const border = level === "full" ? "border-red-500/40" : level === "warn" ? "border-yellow-500/40" : "border-border";
                  const bar = level === "full" ? "bg-red-500" : level === "warn" ? "bg-yellow-500" : "bg-emerald-500";
                  const badge = level === "full" ? "bg-red-500/15 text-red-300 border-red-500/30" : level === "warn" ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
                  return (
                    <li key={i} className={cn("rounded-md border px-3 py-2", border)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-[10px] rounded-full border px-2 py-0.5", badge)}>
                          {level === "full" ? "FULL" : `${pct}%`}
                        </span>
                        <span className="truncate flex-1 text-sm">{s.addr}</span>
                        <span className="text-xs text-muted-foreground">{s.route}</span>
                        <span className="tabular-nums font-medium text-sm">{formatNumber(s.count)}/{formatNumber(s.cap)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full", bar)} style={{ width: `${Math.min(100, s.pct)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
              <Link to="/audit" className="text-xs text-primary hover:underline">Audit log →</Link>
            </div>
            {audit.length === 0 && activity.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No activity yet. Sync forms or load demo data to get started.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {audit.slice(0, 12).map((a) => (
                  <li key={a.id} className="py-2.5 flex items-start gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">
                      {new Date(a.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        <span className="font-medium">{a.action}</span>
                        {a.entity_name && <span className="text-muted-foreground"> · {a.entity_name}</span>}
                      </div>
                      {a.actor_name && (
                        <div className="text-[11px] text-muted-foreground">by {a.actor_name}</div>
                      )}
                    </div>
                  </li>
                ))}
                {audit.length === 0 && activity.slice(0, 10).map((a) => (
                  <li key={a.id} className="py-2.5 flex items-start gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">
                      {new Date(a.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="text-sm flex-1">{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Quick Actions</h2>
            <div className="flex flex-col gap-2">
              <Button onClick={syncAll} disabled={syncing} className="justify-start bg-primary text-primary-foreground hover:bg-primary/90">
                <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} /> Sync all forms
              </Button>
              <Button variant="secondary" className="justify-start" onClick={() => exportMaster(students)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export master spreadsheet
              </Button>
              <Link to="/students" search={{ duplicates: "1" } as any} className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <Copy className="h-4 w-4 mr-2" /> Review {formatNumber(dupGroups.length)} duplicates
                </Button>
              </Link>
              <Link to="/financial-aid" className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <HandHeart className="h-4 w-4 mr-2" /> Financial Aid
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card id="sync-history" className="bg-card border-border mt-6 scroll-mt-20">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Sync History</h2>
          {syncHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No syncs yet. Click "Sync all forms" to fetch registrations.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4">When</th>
                    <th className="text-right py-2 pr-4">Total Fetched</th>
                    <th className="text-right py-2 pr-4">New</th>
                    <th className="text-right py-2">Existing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {syncHistory.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-4">{new Date(e.ts).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(e.total)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-sky-300">{formatNumber(e.added)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{formatNumber(e.updated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
