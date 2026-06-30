import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, Clock, Copy, DollarSign, FileSpreadsheet, RefreshCw, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import { exportMaster } from "@/lib/excel";
import { stopKey } from "@/lib/storage";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { fetchAllPlans, type PaymentPlan } from "@/lib/payment-plans";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — B & B Transit" }] }),
  component: Dashboard,
});

function Kpi({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: any; hint?: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { students, dupGroups, activity, settings, syncAll, syncing, stopCapacities, syncHistory } = useStore();
  const formsSynced = settings.forms.filter((f) => f.formId).length;
  const newCount = students.filter((s) => s.status === "New").length;
  const alertCount = students.filter((s) => s.alertFlag).length;
  const waitlisted = students.filter((s) => s.status === "Waitlisted").length;

  const pay = useMemo(() => {
    const p = { Pending: 0, Received: 0, Overdue: 0 };
    for (const s of students) p[s.paymentStatus || "Pending"]++;
    return p;
  }, [students]);

  const stopAlerts = useMemo(() => {
    const stops = new Map<string, { route: string; addr: string; count: number }>();
    for (const s of students) {
      const k = stopKey(s.schoolName, s.stopAddress);
      const cur = stops.get(k) || { route: s.schoolName, addr: s.stopAddress, count: 0 };
      cur.count++;
      stops.set(k, cur);
    }
    const out: { route: string; addr: string; count: number; cap: number; level: "full" | "near" }[] = [];
    for (const [k, v] of stops) {
      const cap = stopCapacities[k] || 0;
      if (!cap) continue;
      if (v.count >= cap) out.push({ ...v, cap, level: "full" });
      else if (v.count / cap >= 0.9) out.push({ ...v, cap, level: "near" });
    }
    return out;
  }, [students, stopCapacities]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Operational overview of student registrations across all schools."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Total Students" value={formatNumber(students.length)} icon={Users} />
        <Kpi label="New Registrations" value={formatNumber(newCount)} icon={UserPlus} />
        <Kpi label="Waitlisted" value={formatNumber(waitlisted)} icon={Clock} />
        <Kpi label="Alert Flags" value={formatNumber(alertCount)} icon={AlertTriangle} />
        <Kpi label="Duplicates" value={formatNumber(dupGroups.length)} icon={Copy} />
        <Kpi label="Forms Synced" value={formatNumber(formsSynced)} icon={RefreshCw} hint={`${settings.forms.length} configured`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="bg-card border-border lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
                <span className="text-yellow-300">Pending</span>
                <span className="font-semibold tabular-nums">{formatNumber(pay.Pending)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <span className="text-emerald-300">Received</span>
                <span className="font-semibold tabular-nums">{formatNumber(pay.Received)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <span className="text-red-300">Overdue</span>
                <span className="font-semibold tabular-nums">{formatNumber(pay.Overdue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Stop Capacity Alerts</h2>
            {stopAlerts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No stops near or at capacity. Set capacities on the Routes tab.</div>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {stopAlerts.slice(0, 8).map((a, i) => (
                  <li key={i} className="py-2 flex items-center gap-3">
                    <span className={`text-[10px] rounded-full border px-2 py-0.5 ${a.level === "full" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"}`}>
                      {a.level === "full" ? "FULL" : "90%"}
                    </span>
                    <span className="truncate flex-1">{a.addr}</span>
                    <span className="text-xs text-muted-foreground">{a.route}</span>
                    <span className="tabular-nums font-medium">{formatNumber(a.count)}/{formatNumber(a.cap)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Recent Activity</h2>
            {activity.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No activity yet. Sync forms or load demo data to get started.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <span className="text-sm">{a.text}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.ts).toLocaleTimeString()}</span>
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
                <RefreshCw className={"h-4 w-4 mr-2 " + (syncing ? "animate-spin" : "")} /> Sync all forms
              </Button>
              <Button variant="secondary" className="justify-start" onClick={() => exportMaster(students)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export master spreadsheet
              </Button>
              <Link to="/students" className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <Copy className="h-4 w-4 mr-2" /> Review {formatNumber(dupGroups.length)} duplicates
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border mt-6">
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
