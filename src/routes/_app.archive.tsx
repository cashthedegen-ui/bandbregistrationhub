import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Archive as ArchiveIcon, Download, RotateCcw, Trash2 } from "lucide-react";
import { exportRows } from "@/lib/excel";

export const Route = createFileRoute("/_app/archive")({
  head: () => ({ meta: [{ title: "Archive — B & B Transit" }] }),
  component: ArchivePage,
});

function ArchivePage() {
  const { archives, archiveSeason, restoreSeason, deleteArchive, students } = useStore();
  const [label, setLabel] = useState("2025-2026");

  return (
    <>
      <PageHeader title="Archive" subtitle="Save and restore seasons. All data persists locally." />

      <Card className="bg-card border-border mb-6">
        <CardContent className="p-5 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex-1">
            <div className="text-sm font-medium">Archive current season</div>
            <div className="text-xs text-muted-foreground">{students.length} students will be saved.</div>
          </div>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="bg-background md:w-56" placeholder="Season label" />
          <Button onClick={() => archiveSeason(label)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <ArchiveIcon className="h-4 w-4 mr-2" /> Archive Season
          </Button>
        </CardContent>
      </Card>

      {archives.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <ArchiveIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">No archived seasons yet.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {archives.map((a) => (
            <Card key={a.id} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="text-sm font-semibold">{a.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{a.students.length} students • {new Date(a.createdAt).toLocaleDateString()}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => restoreSeason(a.id)}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Restore</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportRows(a.students, `BB_Transit_${a.label}.xlsx`)}><Download className="h-3.5 w-3.5 mr-1.5" />Excel</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteArchive(a.id)}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
