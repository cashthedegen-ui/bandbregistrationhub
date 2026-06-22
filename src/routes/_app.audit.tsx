import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAuditLog, type AuditEntry } from "@/lib/audit-log";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Log — B & B Transit" }] }),
  component: AuditPage,
});

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "numeric", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return ts; }
}

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAuditLog(100);
      setEntries(rows);
    } catch (e: any) {
      toast.error(`Failed to load audit log: ${e?.message || e}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (date) {
        const d = new Date(e.ts).toISOString().slice(0, 10);
        if (d !== date) return false;
      }
      if (!term) return true;
      return (
        (e.entity_name || "").toLowerCase().includes(term) ||
        (e.action || "").toLowerCase().includes(term) ||
        (e.actor_name || "").toLowerCase().includes(term)
      );
    });
  }, [entries, q, date]);

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every meaningful change made in the app. Showing the most recent 100 entries."
        actions={
          <>
            <Link to="/settings"><Button variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" /> Settings</Button></Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
            <Input
              placeholder="Search by student name, action, or user…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-background"
            />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Record</th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No entries.</td></tr>
                ) : filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-3 text-foreground whitespace-nowrap">{fmt(e.ts)}</td>
                    <td className="py-2 pr-3 text-foreground">{e.actor_name || e.actor_email || "—"}</td>
                    <td className="py-2 pr-3 text-foreground">{e.action}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{e.entity_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
