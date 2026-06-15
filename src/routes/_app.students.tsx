import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { AlertTriangle, CheckCheck, Copy, Download, FileText, Filter, Search, X } from "lucide-react";
import type { Status, StudentRow } from "@/lib/types";
import { exportRows, exportStudentsClean } from "@/lib/excel";
import { downloadAllReceipts, downloadReceipt } from "@/lib/receipt";
import { ReceiptModal } from "@/components/receipt-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/students")({
  head: () => ({ meta: [{ title: "Students — B & B Transit" }] }),
  component: StudentsPage,
});

const STATUSES: Status[] = ["New", "Reviewed", "Confirmed", "Exported"];

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    New: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Reviewed: "bg-primary/15 text-primary border-primary/30",
    Confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Exported: "bg-muted text-muted-foreground border-border",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status]}`}>{status}</span>;
}

function StudentsPage() {
  const { students, updateStudent, setStudents, dupGroups, settings } = useStore();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [grade, setGrade] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<StudentRow | null>(null);
  const [dupBanner, setDupBanner] = useState(true);
  const [dupGroupOpen, setDupGroupOpen] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<StudentRow[] | null>(null);

  const schools = useMemo(() => Array.from(new Set(students.map((s) => s.schoolName))).filter(Boolean), [students]);
  const grades = useMemo(() => Array.from(new Set(students.map((s) => s.grade))).filter(Boolean), [students]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return students.filter((s) => {
      if (school !== "all" && s.schoolName !== school) return false;
      if (status !== "all" && s.status !== status) return false;
      if (grade !== "all" && s.grade !== grade) return false;
      if (qq && !(`${s.studentName} ${s.parentName} ${s.parentEmail} ${s.stopAddress}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [students, q, school, status, grade]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  const selectedRows = students.filter((s) => selected.has(s.id));

  const bulkMarkReviewed = () => {
    selectedRows.forEach((r) => updateStudent(r.id, { status: "Reviewed" }));
    toast.success(`Marked ${selectedRows.length} reviewed`);
  };
  const bulkExport = () => {
    if (!selectedRows.length) return toast.warning("No rows selected");
    exportRows(selectedRows, "BB_Transit_Selected.xlsx");
    selectedRows.forEach((r) => updateStudent(r.id, { status: "Exported" }));
  };
  const bulkReceipts = () => {
    if (!selectedRows.length) return toast.warning("No rows selected");
    setReceiptOpen(selectedRows);
  };

  const markAllReviewed = () => {
    const newOnes = students.filter((s) => s.status === "New");
    if (!newOnes.length) return toast.info("No students with status 'New'");
    newOnes.forEach((r) => updateStudent(r.id, { status: "Reviewed" }));
    toast.success(`Marked ${newOnes.length} as Reviewed`);
  };

  const exportAllClean = () => {
    if (!students.length) return toast.warning("No students to export");
    exportStudentsClean(students);
    toast.success(`Exported ${students.length} students`);
  };

  const activeDupGroup = dupGroupOpen ? dupGroups.find((g) => g.id === dupGroupOpen) : null;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${filtered.length} of ${students.length} students`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={markAllReviewed}>
              <CheckCheck className="h-4 w-4 mr-1.5" /> Mark All as Reviewed
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={exportAllClean}>
              <Download className="h-4 w-4 mr-1.5" /> Export to Excel
            </Button>
          </>
        }
      />

      {dupGroups.length > 0 && dupBanner && (
        <Card className="mb-4 border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
          <Copy className="h-4 w-4 text-primary" />
          <span className="text-sm">
            {dupGroups.length} potential duplicate {dupGroups.length === 1 ? "group" : "groups"} detected.
          </span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setDupGroupOpen(dupGroups[0].id)}>
            Review duplicates
          </Button>
          <button onClick={() => setDupBanner(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </Card>
      )}

      <Card className="bg-card border-border p-3 mb-4">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by student, parent, email, stop…" className="pl-9 bg-background" />
          </div>
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="w-full md:w-44 bg-background"><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-36 bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-full md:w-32 bg-background"><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {grades.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" variant="secondary" onClick={bulkMarkReviewed}>Mark Reviewed</Button>
            <Button size="sm" variant="secondary" onClick={bulkExport}>Export Selected</Button>
            <Button size="sm" variant="secondary" onClick={bulkReceipts}>Generate Receipts</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">No students match your filters.</div>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-8"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
                  <th className="px-3 py-3 text-left w-10">#</th>
                  <th className="px-3 py-3 text-left">Student</th>
                  <th className="px-3 py-3 text-left">School</th>
                  <th className="px-3 py-3 text-left">Stop</th>
                  <th className="px-3 py-3 text-left">Parent</th>
                  <th className="px-3 py-3 text-left">Phone</th>
                  <th className="px-3 py-3 text-left">Flags</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Submitted</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setOpenRow(r)}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }} />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{r.studentName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.grade}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.schoolName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[220px] truncate">{r.stopAddress}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.parentName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.parentPhone}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {r.alertFlag && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Alert
                          </span>
                        )}
                        {r.duplicateFlag && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDupGroupOpen(r.duplicateGroupId || null); }}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                          >
                            <Copy className="h-3 w-3" /> Dup
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select value={r.status} onValueChange={(v) => updateStudent(r.id, { status: v as Status })}>
                        <SelectTrigger className="h-7 w-32 bg-background text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(r.submissionDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => downloadReceipt(r, settings.receipt)} title="PDF receipt">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Row detail panel */}
      <Sheet open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <SheetContent className="bg-card border-border w-full sm:max-w-md overflow-y-auto">
          {openRow && (
            <>
              <SheetHeader>
                <SheetTitle>{openRow.studentName}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={openRow.status} />
                  {openRow.alertFlag && <Badge variant="destructive">Alert</Badge>}
                  {openRow.duplicateFlag && <Badge className="bg-primary/15 text-primary border-primary/30">Duplicate</Badge>}
                </div>
                <Field label="Grade" value={openRow.grade} />
                <Field label="School" value={openRow.schoolName} />
                <Field label="Stop" value={openRow.stopAddress} />
                <Field label="Parent" value={openRow.parentName} />
                <Field label="Phone" value={openRow.parentPhone} />
                <Field label="Email" value={openRow.parentEmail} />
                <Field label="Parent Address" value={openRow.parentAddress} />
                {openRow.notes && <Field label="Notes" value={openRow.notes} />}
                <Field label="Submitted" value={new Date(openRow.submissionDate).toLocaleString()} />
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => downloadReceipt(openRow, settings.receipt)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <FileText className="h-4 w-4 mr-2" /> PDF Receipt
                  </Button>
                  <Button variant="secondary" onClick={() => setReceiptOpen([openRow])}>Customize</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Duplicate group panel */}
      <Sheet open={!!activeDupGroup} onOpenChange={(o) => !o && setDupGroupOpen(null)}>
        <SheetContent className="bg-card border-border w-full sm:max-w-2xl overflow-y-auto">
          {activeDupGroup && (
            <>
              <SheetHeader>
                <SheetTitle>Duplicate Review</SheetTitle>
                <p className="text-xs text-muted-foreground">{activeDupGroup.reason}</p>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeDupGroup.rows.map((r) => (
                  <Card key={r.id} className="p-3 bg-background border-border">
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-xs text-muted-foreground mb-2">{r.schoolName} • Grade {r.grade}</div>
                    <div className="text-xs space-y-1">
                      <div>{r.parentName}</div>
                      <div>{r.parentEmail}</div>
                      <div>{r.parentAddress}</div>
                      <div className="text-muted-foreground">Stop: {r.stopAddress}</div>
                      <div className="text-muted-foreground">Submitted {new Date(r.submissionDate).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => { updateStudent(r.id, { duplicateFlag: false }); toast.success("Kept"); }}>Keep</Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        setStudents(students.filter((x) => x.id !== r.id));
                        toast.success("Removed");
                      }}>Remove</Button>

                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {receiptOpen && (
        <ReceiptModal
          rows={receiptOpen}
          onClose={() => setReceiptOpen(null)}
          onDownloadAll={() => downloadAllReceipts(receiptOpen, settings.receipt)}
        />
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
