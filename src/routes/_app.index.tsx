import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, FileSpreadsheet, RefreshCw, UserPlus, Users } from "lucide-react";
import { exportMaster } from "@/lib/excel";

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
  const { students, dupGroups, activity, settings, syncAll, syncing } = useStore();
  const formsSynced = settings.forms.filter((f) => f.formId).length;
  const newCount = students.filter((s) => s.status === "New").length;
  const alertCount = students.filter((s) => s.alertFlag).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Operational overview of student registrations across all schools."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Kpi label="Total Students" value={students.length} icon={Users} />
        <Kpi label="New Registrations" value={newCount} icon={UserPlus} />
        <Kpi label="Alert Flags" value={alertCount} icon={AlertTriangle} />
        <Kpi label="Duplicates" value={dupGroups.length} icon={Copy} />
        <Kpi label="Forms Synced" value={formsSynced} icon={RefreshCw} hint={`${Object.keys(settings.formIds).length} configured`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
            </div>
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
                  <Copy className="h-4 w-4 mr-2" /> Review {dupGroups.length} duplicates
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
