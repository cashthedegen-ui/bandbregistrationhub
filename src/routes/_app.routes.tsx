import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, ArrowRightLeft } from "lucide-react";
import { exportRoutesWorkbook } from "@/lib/excel";
import { downloadDriverSheet } from "@/lib/driver-sheet";
import { stopKey } from "@/lib/storage";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PaymentStatus, StudentRow } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/routes")({
  head: () => ({ meta: [{ title: "Routes — B & B Transit" }] }),
  component: RoutesPage,
});

const PAYMENT_CLASS: Record<PaymentStatus, string> = {
  Pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Received: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
};

function capacityClass(filled: number, cap: number) {
  if (!cap) return "text-muted-foreground";
  const pct = filled / cap;
  if (filled >= cap) return "text-red-400 font-semibold";
  if (pct >= 0.9) return "text-yellow-400 font-semibold";
  return "text-muted-foreground";
}

const STOP_SCOPE = "__all__";

function RoutesPage() {
  const { students, stopCapacities, setStopCapacity, updateStudent } = useStore();

  const confirmedStudents = useMemo(
    () => students.filter((s) => s.paid && s.status === "Confirmed"),
    [students],
  );

  const stops = useMemo(() => {
    const map = new Map<string, StudentRow[]>();
    for (const s of confirmedStudents) {
      const k = (s.stopAddress || "Unassigned").trim();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [confirmedStudents]);

  const moveToSecond = (r: StudentRow) => {
    if (!r.stopAddress2) return toast.warning("No 2nd choice on file");
    updateStudent(r.id, { stopAddress: r.stopAddress2, stopAddress2: r.stopAddress });
    toast.success(`Moved ${r.studentName} to 2nd choice`);
  };

  return (
    <>
      <PageHeader
        title="Routes"
        subtitle="Confirmed and paid riders only. One card per bus stop, independent of school."
        actions={
          <Button variant="secondary" onClick={() => exportRoutesWorkbook(confirmedStudents)}>
            <Download className="h-4 w-4 mr-2" /> Export Routes
          </Button>
        }
      />

      {stops.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center text-sm text-muted-foreground">
          No confirmed, paid riders yet. Confirm students and mark payment on the Students tab.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stops.map(([addr, kids]) => {
            const cap = stopCapacities[stopKey(STOP_SCOPE, addr)] || 0;
            const full = cap > 0 && kids.length >= cap;
            const near = cap > 0 && !full && kids.length / cap >= 0.9;
            const schoolsHere = Array.from(new Set(kids.map((k) => k.schoolName))).filter(Boolean);
            return (
              <Card key={addr} className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{addr}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {schoolsHere.join(" • ") || "—"}
                      </div>
                    </div>
                    <div className={`text-2xl font-semibold tabular-nums ${capacityClass(kids.length, cap)}`}>
                      {formatNumber(kids.length)}{cap ? `/${formatNumber(cap)}` : ""}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {full && <span className="text-[10px] rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-300">FULL</span>}
                    {near && <span className="text-[10px] rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300">90%</span>}
                    <span className="text-[10px] text-muted-foreground">Capacity:</span>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={cap || ""}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setStopCapacity(STOP_SCOPE, addr, Number.isFinite(v) ? v : 0);
                      }}
                      className="h-6 w-16 text-xs bg-background"
                      placeholder="—"
                    />
                    <Button size="sm" variant="secondary" className="ml-auto h-7" onClick={() => downloadDriverSheet(addr, kids)}>
                      <FileText className="h-3.5 w-3.5 mr-1" /> Sheet
                    </Button>
                  </div>

                  <ul className="mt-4 divide-y divide-border text-xs">
                    {kids.map((k) => (
                      <li key={k.id} className="py-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{k.studentName}</span>
                            <span className="text-[10px] text-muted-foreground">G{k.grade}</span>
                            {k.status === "Waitlisted" && <span className="text-[10px] text-amber-400">(waitlisted)</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {k.schoolName}
                            {k.stopAddress2 && <> • 2nd: <span className="text-foreground/70">{k.stopAddress2}</span></>}
                          </div>
                        </div>
                        <span className={`text-[10px] rounded-full border px-1.5 py-0.5 shrink-0 ${PAYMENT_CLASS[k.paymentStatus || "Pending"]}`}>
                          {k.paymentType === "Financial Aid"
                            ? `Fam ${formatCurrency(k.familyPaid || 0, { decimals: 0 })} / Sch ${formatCurrency(k.schoolOwes || 0, { decimals: 0 })}`
                            : k.paid ? formatCurrency(k.amountPaid || 0, { decimals: 0 }) : (k.paymentStatus || "Pending")}
                        </span>
                        {k.stopAddress2 && (
                          <button
                            onClick={() => moveToSecond(k)}
                            title="Move to 2nd choice"
                            className="text-primary hover:underline shrink-0 inline-flex items-center gap-1 text-[10px]"
                          >
                            <ArrowRightLeft className="h-3 w-3" /> 2nd
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {full && (
                    <div className="mt-3 text-[10px] text-red-300">
                      At capacity — consider moving students to their 2nd choice or mark as Waitlisted.
                    </div>
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
