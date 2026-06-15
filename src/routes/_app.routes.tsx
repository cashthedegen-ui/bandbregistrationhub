import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Download, FileText } from "lucide-react";
import { exportRoutesWorkbook } from "@/lib/excel";
import { downloadDriverSheet } from "@/lib/driver-sheet";
import { stopKey } from "@/lib/storage";

export const Route = createFileRoute("/_app/routes")({
  head: () => ({ meta: [{ title: "Routes — B & B Transit" }] }),
  component: RoutesPage,
});

function capacityClass(filled: number, cap: number) {
  if (!cap) return "text-muted-foreground";
  const pct = filled / cap;
  if (filled >= cap) return "text-red-400 font-semibold";
  if (pct >= 0.9) return "text-yellow-400 font-semibold";
  return "text-muted-foreground";
}

function RoutesPage() {
  const { students, stopCapacities, setStopCapacity } = useStore();
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
        subtitle="One card per school route. Set seat capacity per stop to track availability."
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
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => downloadDriverSheet(route, list)}>
                      <FileText className="h-4 w-4 mr-1.5" /> Driver Sheet
                    </Button>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {visibleStops.map(([addr, kids]) => {
                      const hasAlert = kids.some((k) => k.alertFlag);
                      const cap = stopCapacities[stopKey(route, addr)] || 0;
                      const full = cap > 0 && kids.length >= cap;
                      const near = cap > 0 && !full && kids.length / cap >= 0.9;
                      return (
                        <li key={addr} className="text-xs">
                          <div className="flex items-center gap-2">
                            {hasAlert && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                            {full && <span className="text-[10px] rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-300 shrink-0">FULL</span>}
                            {near && <span className="text-[10px] rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300 shrink-0">90%</span>}
                            <span className="text-foreground/90 truncate">{addr}</span>
                            <span className={`ml-auto tabular-nums ${capacityClass(kids.length, cap)}`}>
                              {kids.length}{cap ? `/${cap}` : ""}{cap ? " seats" : ""}
                            </span>
                          </div>
                          <div className="mt-1 ml-4 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">Capacity:</span>
                            <Input
                              type="number"
                              min={0}
                              defaultValue={cap || ""}
                              onBlur={(e) => {
                                const v = parseInt(e.target.value, 10);
                                setStopCapacity(route, addr, Number.isFinite(v) ? v : 0);
                              }}
                              className="h-6 w-16 text-xs bg-background"
                              placeholder="—"
                            />
                          </div>
                          <ul className="mt-1 ml-4 text-muted-foreground space-y-0.5">
                            {kids.map((k) => (
                              <li key={k.id}>
                                • {k.studentName} <span className="text-[10px]">G{k.grade}</span>
                                {k.status === "Waitlisted" && <span className="ml-1 text-[10px] text-amber-400">(waitlisted)</span>}
                              </li>
                            ))}
                          </ul>
                          {full && (
                            <div className="mt-1 ml-4 text-[10px] text-red-300">
                              At capacity — mark new students at this stop as Waitlisted.
                            </div>
                          )}
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
