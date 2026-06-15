import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { exportRoutesWorkbook } from "@/lib/excel";

export const Route = createFileRoute("/_app/routes")({
  head: () => ({ meta: [{ title: "Routes — B & B Transit" }] }),
  component: RoutesPage,
});

function RoutesPage() {
  const { students } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, typeof students>();
    for (const s of students) {
      const k = s.schoolName || "Unassigned";
      if (!map.has(k)) map.set(k, [] as any);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [students]);

  const max = grouped[0]?.[1].length || 1;

  return (
    <>
      <PageHeader
        title="Routes"
        subtitle="One card per school route. Click a route to expand all stops."
        actions={
          <Button variant="secondary" onClick={() => exportRoutesWorkbook(students)}>
            <Download className="h-4 w-4 mr-2" /> Export Routes
          </Button>
        }
      />

      {grouped.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center text-sm text-muted-foreground">
          No routes yet. Sync forms to populate routes.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(([route, list]) => {
            const stops = new Map<string, typeof list>();
            for (const s of list) {
              const k = s.stopAddress || "—";
              if (!stops.has(k)) stops.set(k, [] as any);
              stops.get(k)!.push(s);
            }
            const gradeCounts: Record<string, number> = {};
            for (const s of list) gradeCounts[s.grade || "?"] = (gradeCounts[s.grade || "?"] || 0) + 1;
            const open = expanded[route] ?? false;
            const stopEntries = Array.from(stops.entries());
            const visibleStops = open ? stopEntries : stopEntries.slice(0, 4);
            return (
              <Card key={route} className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold">{route}</div>
                      <div className="text-xs text-muted-foreground">{list.length} students • {stops.size} stops</div>
                    </div>
                    <div className="text-2xl font-semibold text-primary">{list.length}</div>
                  </div>
                  <div className="mt-3 h-1.5 w-full bg-muted rounded">
                    <div className="h-1.5 bg-primary rounded" style={{ width: `${(list.length / max) * 100}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(gradeCounts).sort().map(([g, c]) => (
                      <span key={g} className="text-[10px] rounded-full border border-border bg-muted/40 px-2 py-0.5">
                        G{g}: {c}
                      </span>
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {visibleStops.map(([addr, kids]) => {
                      const hasAlert = kids.some((k) => k.alertFlag);
                      return (
                        <li key={addr} className="text-xs">
                          <div className="flex items-center gap-2">
                            {hasAlert && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                            <span className="text-foreground/90 truncate">{addr}</span>
                            <span className="ml-auto text-muted-foreground">{kids.length}</span>
                          </div>
                          <ul className="mt-1 ml-4 text-muted-foreground space-y-0.5">
                            {kids.map((k) => (
                              <li key={k.id}>• {k.studentName} <span className="text-[10px]">G{k.grade}</span></li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                  {stopEntries.length > 4 && (
                    <button
                      className="mt-3 text-xs text-primary flex items-center gap-1 hover:underline"
                      onClick={() => setExpanded({ ...expanded, [route]: !open })}
                    >
                      {open ? <><ChevronUp className="h-3 w-3" /> Collapse</> : <><ChevronDown className="h-3 w-3" /> Show {stopEntries.length - 4} more stops</>}
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
