import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — B & B Transit" }] }),
  component: Analytics,
});

const COLORS = ["#f0c14b", "#60a5fa", "#34d399", "#f87171", "#a78bfa"];

function Analytics() {
  const { students, dupGroups } = useStore();

  const bySchool = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) m.set(s.schoolName, (m.get(s.schoolName) || 0) + 1);
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [students]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) m.set(s.status, (m.get(s.status) || 0) + 1);
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [students]);

  const byGrade = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) m.set(s.grade || "?", (m.get(s.grade || "?") || 0) + 1);
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      const d = new Date(s.submissionDate).toISOString().slice(0, 10);
      m.set(d, (m.get(d) || 0) + 1);
    }
    return Array.from(m, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }, [students]);

  const alertRows = students.filter((s) => s.alertFlag);
  const reviewedPct = students.length ? Math.round((students.filter((s) => s.status !== "New").length / students.length) * 100) : 0;

  const paymentBySchool = useMemo(() => {
    const m = new Map<string, { total: number; collected: number; paid: number }>();
    for (const s of students) {
      const k = s.schoolName || "Unassigned";
      const cur = m.get(k) || { total: 0, collected: 0, paid: 0 };
      cur.total += 1;
      if (s.paid) {
        cur.paid += 1;
        cur.collected += Number(s.amountPaid) || 0;
      }
      m.set(k, cur);
    }
    return Array.from(m, ([school, v]) => ({ school, ...v })).sort((a, b) => b.total - a.total);
  }, [students]);
  const grandTotal = paymentBySchool.reduce((a, b) => a + b.collected, 0);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Trends across all school registrations." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Total Students" value={students.length} />
        <Stat label="Alerts" value={alertRows.length} />
        <Stat label="Duplicates" value={dupGroups.length} />
        <Stat label="Reviewed" value={`${reviewedPct}%`} />
      </div>

      <Card className="bg-card border-border mb-6">
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments by School</h2>
            <div className="text-sm text-muted-foreground">Total collected: <span className="text-emerald-300 font-semibold">${grandTotal.toFixed(2)}</span></div>
          </div>
          {paymentBySchool.length === 0 ? (
            <div className="text-sm text-muted-foreground">No students yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-2">School</th>
                  <th className="text-right py-2">Total Students</th>
                  <th className="text-right py-2">Paid</th>
                  <th className="text-right py-2">Total Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentBySchool.map((r) => (
                  <tr key={r.school}>
                    <td className="py-2 font-medium">{r.school}</td>
                    <td className="py-2 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.paid}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-300">${r.collected.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Students by School">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bySchool}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#f0c14b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Registration Status">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90}>
                {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Students by Grade">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byGrade}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Registrations Over Time">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={byDate}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#f0c14b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="bg-card border-border mt-6">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Alert Flags Breakdown</h2>
          {alertRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No alert flags.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left py-2">Student</th><th className="text-left py-2">School</th><th className="text-left py-2">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alertRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">{r.studentName}</td>
                    <td className="py-2 text-muted-foreground">{r.schoolName}</td>
                    <td className="py-2 text-muted-foreground">{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const tooltipStyle = { background: "#1a1d26", border: "1px solid #ffffff20", borderRadius: 8, fontSize: 12, color: "#fff" };

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
function ChartCard({ title, children }: { title: string; children: any }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}
