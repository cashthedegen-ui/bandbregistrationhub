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
import { AlertTriangle, BadgeCheck, CheckCheck, Copy, Download, FileText, Filter, Pencil, Search, StickyNote, Trash2, X } from "lucide-react";
import type { PaymentStatus, PaymentType, Status, StudentRow } from "@/lib/types";
import { exportRows, exportStudentsClean } from "@/lib/excel";
import { downloadAllReceipts, downloadReceipt } from "@/lib/receipt";
import { ReceiptModal } from "@/components/receipt-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/_app/students")({
  head: () => ({ meta: [{ title: "Students — B & B Transit" }] }),
  component: StudentsPage,
});

const STATUSES: Status[] = ["New", "Reviewed", "Confirmed", "Exported", "Waitlisted"];
const PAYMENTS: PaymentStatus[] = ["Pending", "Received", "Overdue"];
const PAYMENT_TYPES: PaymentType[] = ["Self Pay", "Financial Aid", "Unpaid"];

const PAYMENT_CLASS: Record<PaymentStatus, string> = {
  Pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Received: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
};

const PAYMENT_TYPE_CLASS: Record<PaymentType, string> = {
  "Self Pay": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Financial Aid": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Unpaid": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
};

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    New: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Reviewed: "bg-primary/15 text-primary border-primary/30",
    Confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Exported: "bg-muted text-muted-foreground border-border",
    Waitlisted: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status]}`}>{status}</span>;
}

function StudentsPage() {
  const { students, updateStudent, deleteStudent, setStudents, dupGroups, settings } = useStore();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [grade, setGrade] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<StudentRow | null>(null);
  const [dupBanner, setDupBanner] = useState(true);
  const [dupGroupOpen, setDupGroupOpen] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<StudentRow[] | null>(null);
  const [notesRow, setNotesRow] = useState<StudentRow | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [editRow, setEditRow] = useState<StudentRow | null>(null);
  const [editDraft, setEditDraft] = useState<StudentRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<StudentRow | null>(null);


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
        subtitle={`${formatNumber(filtered.length)} of ${formatNumber(students.length)} students`}
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
                  <th className="px-3 py-3 text-left">Grade</th>
                  <th className="px-3 py-3 text-left">School</th>
                  <th className="px-3 py-3 text-left">Stop (1st / 2nd)</th>
                  <th className="px-3 py-3 text-left">Parent</th>
                  <th className="px-3 py-3 text-left">Phone</th>
                  <th className="px-3 py-3 text-left">Flags</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Payment</th>
                  <th className="px-3 py-3 text-left">Payment Type</th>
                  <th className="px-3 py-3 text-left">Submitted</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setOpenRow(r)}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatNumber(idx + 1)}</td>
                    <td className="px-3 py-2.5 font-medium">{r.studentName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.grade}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.schoolName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[260px]">
                      <div className="truncate"><span className="text-[10px] text-primary mr-1">1st</span>{r.stopAddress || "—"}</div>
                      {r.stopAddress2 && (
                        <div className="truncate flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground mr-1">2nd</span>
                          <span className="truncate">{r.stopAddress2}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStudent(r.id, { stopAddress: r.stopAddress2!, stopAddress2: r.stopAddress });
                              toast.success("Moved to 2nd choice");
                            }}
                            className="ml-1 text-[10px] text-primary hover:underline shrink-0"
                            title="Reassign to 2nd choice"
                          >Move →</button>
                        </div>
                      )}
                    </td>
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
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select value={r.paymentStatus || "Pending"} onValueChange={(v) => updateStudent(r.id, { paymentStatus: v as PaymentStatus })}>
                        <SelectTrigger className={`h-7 w-28 text-xs border ${PAYMENT_CLASS[r.paymentStatus || "Pending"]}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const pt: PaymentType = r.paymentType || (r.paid ? "Self Pay" : "Unpaid");
                        return (
                          <div className="flex flex-col gap-1">
                            <Select value={pt} onValueChange={(v) => updateStudent(r.id, { paymentType: v as PaymentType })}>
                              <SelectTrigger className={`h-7 w-32 text-xs border ${PAYMENT_TYPE_CLASS[pt]}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {pt === "Self Pay" && (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={r.amountPaid ?? 0}
                                onChange={(e) => updateStudent(r.id, { amountPaid: parseFloat(e.target.value) || 0 })}
                                className="h-7 w-32 bg-background text-xs"
                                placeholder="Amount $"
                              />
                            )}
                            {pt === "Financial Aid" && (
                              <Input
                                value={r.financialAidNotes ?? ""}
                                onChange={(e) => updateStudent(r.id, { financialAidNotes: e.target.value })}
                                className="h-7 w-32 bg-background text-xs"
                                placeholder="Aid details"
                              />
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(r.submissionDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {r.status !== "Confirmed" && (
                          <Button size="icon" variant="ghost" onClick={() => { updateStudent(r.id, { status: "Confirmed" }); toast.success(`${r.studentName} confirmed`); }} title="Confirm student">
                            <BadgeCheck className="h-4 w-4 text-emerald-400" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => { setEditRow(r); setEditDraft({ ...r }); }} title="Edit student">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setNotesRow(r); setNotesDraft(r.notes || ""); }} title={r.notes ? "Notes (saved)" : "Add notes"}>
                          <StickyNote className={`h-4 w-4 ${r.notes ? "text-primary" : ""}`} />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => downloadReceipt(r, settings.receipt)} title="PDF receipt">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteRow(r)} title="Delete student">
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
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

      <Dialog open={!!notesRow} onOpenChange={(o) => !o && setNotesRow(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Notes — {notesRow?.studentName}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Add free-text notes for this student…"
            className="min-h-[160px] bg-background"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesRow(null)}>Cancel</Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => {
                if (notesRow) {
                  updateStudent(notesRow.id, { notes: notesDraft });
                  toast.success("Notes saved");
                }
                setNotesRow(null);
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) { setEditRow(null); setEditDraft(null); } }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student{editDraft ? ` — ${editDraft.studentName}` : ""}</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <EditField label="Student Name" value={editDraft.studentName} onChange={(v) => setEditDraft({ ...editDraft, studentName: v })} />
              <EditField label="Grade" value={editDraft.grade} onChange={(v) => setEditDraft({ ...editDraft, grade: v })} />
              <EditField label="School" value={editDraft.schoolName} onChange={(v) => setEditDraft({ ...editDraft, schoolName: v })} />
              <EditField label="Bus Stop (1st)" value={editDraft.stopAddress} onChange={(v) => setEditDraft({ ...editDraft, stopAddress: v })} />
              <EditField label="Bus Stop (2nd)" value={editDraft.stopAddress2 || ""} onChange={(v) => setEditDraft({ ...editDraft, stopAddress2: v })} />
              <EditField label="Parent Name" value={editDraft.parentName} onChange={(v) => setEditDraft({ ...editDraft, parentName: v })} />
              <EditField label="Phone" value={editDraft.parentPhone} onChange={(v) => setEditDraft({ ...editDraft, parentPhone: v })} />
              <EditField label="Email" value={editDraft.parentEmail} onChange={(v) => setEditDraft({ ...editDraft, parentEmail: v })} />
              <div className="sm:col-span-2">
                <EditField label="Address" value={editDraft.parentAddress} onChange={(v) => setEditDraft({ ...editDraft, parentAddress: v })} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editDraft.status} onValueChange={(v) => setEditDraft({ ...editDraft, status: v as Status })}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Type</Label>
                <Select
                  value={editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")}
                  onValueChange={(v) => setEditDraft({ ...editDraft, paymentType: v as PaymentType, paid: v !== "Unpaid" })}
                >
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")) === "Self Pay" && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount Paid</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={editDraft.amountPaid ?? 0}
                    onChange={(e) => setEditDraft({ ...editDraft, amountPaid: parseFloat(e.target.value) || 0 })}
                    className="mt-1 bg-background"
                  />
                </div>
              )}
              {(editDraft.paymentType || (editDraft.paid ? "Self Pay" : "Unpaid")) === "Financial Aid" && (
                <div className="sm:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Financial Aid Details</Label>
                  <Input
                    value={editDraft.financialAidNotes || ""}
                    onChange={(e) => setEditDraft({ ...editDraft, financialAidNotes: e.target.value })}
                    placeholder="e.g. Hopkins covering full tuition"
                    className="mt-1 bg-background"
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment Status</Label>
                <Select value={editDraft.paymentStatus || "Pending"} onValueChange={(v) => setEditDraft({ ...editDraft, paymentStatus: v as PaymentStatus })}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea
                  value={editDraft.notes || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                  className="mt-1 bg-background min-h-[80px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditRow(null); setEditDraft(null); }}>Cancel</Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => {
                if (editRow && editDraft) {
                  updateStudent(editRow.id, editDraft);
                  toast.success("Student updated");
                }
                setEditRow(null);
                setEditDraft(null);
              }}
            >Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this student?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium text-foreground">{deleteRow?.studentName}</span> from the roster. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteRow) {
                  deleteStudent(deleteRow.id);
                  toast.success(`Deleted ${deleteRow.studentName}`);
                }
                setDeleteRow(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 bg-background" />
    </div>
  );
}
