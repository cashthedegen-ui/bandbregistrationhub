import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, FileSpreadsheet } from "lucide-react";
import { downloadStudentsExcel } from "@/lib/export/students-export";
import type { StudentRow } from "@/lib/types";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: StudentRow[];
  planFamilyKeys?: Set<string>;
}

type PayFilter = "all" | "paid" | "pending" | "unpaid";

export function ExportStudentsDialog({ open, onOpenChange, students, planFamilyKeys }: Props) {
  const allSchools = useMemo(
    () => Array.from(new Set(students.map((s) => s.schoolName).filter(Boolean))).sort(),
    [students],
  );
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [faOnly, setFaOnly] = useState(false);
  const [splitBySchool, setSplitBySchool] = useState(true);
  const now = new Date();
  const [schoolYear, setSchoolYear] = useState(`${now.getFullYear()}-${now.getFullYear() + 1}`);

  const schoolsList = selectedSchools.size ? Array.from(selectedSchools) : undefined;

  const preview = useMemo(() => {
    return students.filter((r) => {
      if (schoolsList && !schoolsList.includes(r.schoolName)) return false;
      if (faOnly && r.paymentType !== "Financial Aid") return false;
      if (payFilter !== "all") {
        const lbl =
          r.paymentStatus === "Received" ? "paid" :
          r.paymentStatus === "Overdue" ? "unpaid" :
          (r.paymentType === "Unpaid" || (!r.paid && !r.paymentType)) ? "unpaid" :
          "pending";
        if (lbl !== payFilter) return false;
      }
      return true;
    }).length;
  }, [students, schoolsList, faOnly, payFilter]);

  const toggleSchool = (name: string) => {
    setSelectedSchools((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const clearSchools = () => setSelectedSchools(new Set());
  const selectAllSchools = () => setSelectedSchools(new Set(allSchools));

  const doExport = () => {
    if (!preview) {
      toast.warning("No students match those filters");
      return;
    }
    const { filename, count } = downloadStudentsExcel(students, {
      schools: schoolsList,
      paymentStatus: payFilter,
      financialAidOnly: faOnly,
      splitBySchool,
      planFamilyKeys,
      schoolYear,
    });
    toast.success(`Exported ${formatNumber(count)} students — ${filename}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Export Students to Excel
          </DialogTitle>
          <DialogDescription>
            Produces an operational workbook with a Summary tab and one tab per school.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Schools */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schools</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectAllSchools} className="text-primary hover:underline">All</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={clearSchools} className="text-primary hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-auto rounded-md border border-border bg-background/40 p-3">
              {allSchools.length === 0 && (
                <div className="text-xs text-muted-foreground">No schools yet.</div>
              )}
              {allSchools.map((s) => {
                const on = selectedSchools.has(s);
                return (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={on} onCheckedChange={() => toggleSchool(s)} />
                    <span className="truncate">{s}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {selectedSchools.size ? `${selectedSchools.size} selected` : "All schools included"}
            </div>
          </section>

          {/* Filters */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Status</Label>
              <RadioGroup value={payFilter} onValueChange={(v) => setPayFilter(v as PayFilter)} className="mt-2 space-y-1.5">
                {[
                  { v: "all", l: "All" },
                  { v: "paid", l: "Paid only" },
                  { v: "pending", l: "Pending only" },
                  { v: "unpaid", l: "Unpaid / Overdue" },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value={o.v} id={`pf-${o.v}`} />
                    <span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={faOnly} onCheckedChange={(v) => setFaOnly(!!v)} />
                    Financial Aid students only
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={splitBySchool} onCheckedChange={(v) => setSplitBySchool(!!v)} />
                    One tab per school
                  </label>
                </div>
              </div>
              <div>
                <Label htmlFor="sy" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">School Year</Label>
                <Input id="sy" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} className="mt-1 h-8" placeholder="2026-2027" />
              </div>
            </div>
          </section>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <span className="font-semibold text-primary">{formatNumber(preview)}</span>{" "}
            student{preview === 1 ? "" : "s"} will be exported.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doExport} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Download className="h-4 w-4 mr-1.5" /> Export Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
