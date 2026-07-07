import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, FileText, Pencil, Plus, Receipt, ShieldAlert, Wallet, XCircle } from "lucide-react";
import type { StudentRow } from "@/lib/types";
import {
  type PaymentPlan, type PaymentInstallment, type PaymentRecord, type PlanFrequency, type PlanStatus,
  type BillingType, type BillingChange,
  familyKeyOf, familySiblings, fetchPlanByFamily, fetchInstallments, fetchRecords,
  createPaymentPlan, recordPayment, updateInstallment, waiveInstallment, applyCredit, updatePlanNotes,
  cancelPaymentPlan, fetchBillingChanges,
} from "@/lib/payment-plans";
import { logAudit } from "@/lib/audit-log";

const PLAN_BADGE: Record<PlanStatus, string> = {
  Current: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Upcoming: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
  "Paid Off": "bg-primary/15 text-primary border-primary/30",
  Cancelled: "bg-muted text-muted-foreground border-border",
  "Removed by Admin": "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export function PaymentPlanDrawer({
  open, onOpenChange, anchor, students, onPlanChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: StudentRow | null;
  students: StudentRow[];
  onPlanChanged?: () => void;
}) {
  const familyKey = anchor ? familyKeyOf(anchor) : "";
  const siblings = useMemo(() => (anchor ? familySiblings(students, familyKey) : []), [students, familyKey, anchor]);
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<PaymentInstallment | "free" | null>(null);
  const [waiveOpen, setWaiveOpen] = useState<PaymentInstallment | null>(null);
  const [editInst, setEditInst] = useState<PaymentInstallment | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [history, setHistory] = useState<BillingChange[]>([]);

  const reload = useCallback(async () => {
    if (!familyKey) return;
    setLoading(true);
    try {
      const [p, hist] = await Promise.all([fetchPlanByFamily(familyKey), fetchBillingChanges(familyKey)]);
      setPlan(p);
      setHistory(hist);
      if (p) {
        const [ins, rec] = await Promise.all([fetchInstallments(p.id), fetchRecords(p.id)]);
        setInstallments(ins);
        setRecords(rec);
        setNotesDraft(p.notes || "");
      } else {
        setInstallments([]); setRecords([]); setNotesDraft("");
      }
    } catch (e: any) {
      toast.error(`Failed to load plan: ${e?.message || e}`);
    } finally { setLoading(false); }
  }, [familyKey]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  if (!anchor) return null;

  const totalPaid = plan?.amount_paid ?? 0;
  const totalAmount = plan?.total_amount ?? 0;
  const progress = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
  const installmentsRemaining = installments.filter((i) => !i.waived && i.status !== "Paid").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-card border-border w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Family Payment — {anchor.parentName || anchor.studentName}
          </SheetTitle>
          <div className="text-xs text-muted-foreground">
            {siblings.length} student{siblings.length === 1 ? "" : "s"}: {siblings.map((s) => s.studentName).join(", ")}
          </div>
        </SheetHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !plan ? (
          <div className="mt-6">
            <Card className="bg-background border-border p-6 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <div className="text-sm font-medium mb-1">No payment plan yet</div>
              <div className="text-xs text-muted-foreground mb-4">
                This family currently uses the existing payment workflow (Paid in Full). Create a Payment Plan to switch to installments.
              </div>
              <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-1.5" /> Create Payment Plan
              </Button>
            </Card>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Summary */}
            <Card className="bg-background border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <Badge className={`border ${PLAN_BADGE[plan.status]}`}>{plan.status}</Badge>
                <span className="text-xs text-muted-foreground">{plan.frequency} • {plan.installment_count} installments</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                <Stat label="Total" value={formatCurrency(plan.total_amount)} />
                <Stat label="Paid" value={formatCurrency(plan.amount_paid)} tone="ok" />
                <Stat label="Remaining" value={formatCurrency(plan.remaining_balance)} tone={plan.remaining_balance > 0 ? "warn" : "ok"} />
                <Stat label="Next Due" value={plan.next_due_date ? new Date(plan.next_due_date + "T00:00:00").toLocaleDateString() : "—"} />
              </div>
              <Progress value={progress} className="h-2" />
              <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                <span>{installmentsRemaining} installment{installmentsRemaining === 1 ? "" : "s"} remaining</span>
                <span>{progress.toFixed(0)}% paid</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button size="sm" onClick={() => setPayOpen("free")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Receipt className="h-4 w-4 mr-1.5" /> Record Payment
                </Button>
                <Button size="sm" variant="secondary" onClick={async () => {
                  const amt = Number(prompt("Credit amount ($):") || "0");
                  if (!amt) return;
                  const note = prompt("Reason / notes:") || "Credit applied";
                  await applyCredit(plan.id, amt, note);
                  toast.success("Credit applied"); reload();
                }}>Apply Credit</Button>
              </div>
            </Card>

            {/* Installments */}
            <Card className="bg-background border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Installment Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2 pr-2">Due Date</th>
                      <th className="text-right py-2 pr-2">Amount</th>
                      <th className="text-right py-2 pr-2">Paid</th>
                      <th className="text-left py-2 pr-2">Status</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {installments.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2 pr-2 text-muted-foreground">{i.sequence}</td>
                        <td className="py-2 pr-2">{new Date(i.due_date + "T00:00:00").toLocaleDateString()}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(i.amount)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(i.amount_paid)}</td>
                        <td className="py-2 pr-2"><InstStatus s={i.status} waived={i.waived} /></td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {i.status !== "Paid" && !i.waived && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setPayOpen(i)} title="Record payment for this installment">
                                <Receipt className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditInst(i)} title="Edit due date / amount">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setWaiveOpen(i)} title="Waive">
                                <XCircle className="h-4 w-4 text-red-400" />
                              </Button>
                            </>
                          )}
                          {i.status === "Paid" && <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Payment history */}
            <Card className="bg-background border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Payment History</h3>
                <span className="ml-auto text-xs text-muted-foreground">Append-only · {records.length} record{records.length === 1 ? "" : "s"}</span>
              </div>
              {records.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3">No payments recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-2 pr-2">Date</th>
                        <th className="text-right py-2 pr-2">Amount</th>
                        <th className="text-left py-2 pr-2">Method</th>
                        <th className="text-left py-2 pr-2">Confirm #</th>
                        <th className="text-left py-2 pr-2">Staff</th>
                        <th className="text-left py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {records.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-2">{new Date(r.payment_date + "T00:00:00").toLocaleDateString()}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                          <td className="py-2 pr-2">{r.method}{r.kind !== "Payment" && r.kind !== "DownPayment" ? ` (${r.kind})` : ""}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{r.confirmation_number || "—"}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{r.staff_name || "—"}</td>
                          <td className="py-2 text-muted-foreground truncate max-w-[180px]">{r.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Internal notes */}
            <Card className="bg-background border-border p-4">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Internal Notes</Label>
              <Textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                className="mt-2 bg-background min-h-[70px]"
                placeholder="Staff-only notes about this plan…"
              />
              <Button size="sm" className="mt-2" variant="secondary" onClick={async () => {
                await updatePlanNotes(plan.id, notesDraft); toast.success("Notes saved"); reload();
              }}>Save notes</Button>
            </Card>
          </div>
        )}

        {/* Create plan dialog */}
        <CreatePlanDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          anchor={anchor}
          siblings={siblings}
          onCreated={() => { setCreateOpen(false); reload(); onPlanChanged?.(); }}
        />

        {/* Record payment dialog */}
        <RecordPaymentDialog
          open={!!payOpen}
          onClose={() => setPayOpen(null)}
          plan={plan}
          installment={payOpen && payOpen !== "free" ? payOpen : null}
          onDone={() => { setPayOpen(null); reload(); onPlanChanged?.(); }}
        />

        {/* Edit installment */}
        <EditInstallmentDialog
          open={!!editInst}
          onClose={() => setEditInst(null)}
          installment={editInst}
          onSaved={() => { setEditInst(null); reload(); }}
        />

        {/* Waive */}
        <WaiveDialog
          open={!!waiveOpen}
          onClose={() => setWaiveOpen(null)}
          plan={plan}
          installment={waiveOpen}
          onDone={() => { setWaiveOpen(null); reload(); onPlanChanged?.(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-yellow-300" : tone === "ok" ? "text-emerald-300" : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function InstStatus({ s, waived }: { s: string; waived: boolean }) {
  if (waived) return <Badge className="border bg-muted text-muted-foreground border-border">Waived</Badge>;
  const map: Record<string, string> = {
    Paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Due: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Upcoming: "bg-muted text-muted-foreground border-border",
    Overdue: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[s] || ""}`}>{s}</span>;
}

function CreatePlanDialog({
  open, onClose, anchor, siblings, onCreated,
}: {
  open: boolean; onClose: () => void; anchor: StudentRow; siblings: StudentRow[];
  onCreated: () => void;
}) {
  const [total, setTotal] = useState("0");
  const [down, setDown] = useState("0");
  const [count, setCount] = useState("4");
  const [freq, setFreq] = useState<PlanFrequency>("Monthly");
  const [customDays, setCustomDays] = useState("30");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = Math.max(0, Number(total) - Number(down));
  const perInst = Number(count) > 0 ? remaining / Number(count) : 0;

  const submit = async () => {
    if (Number(total) <= 0) return toast.error("Enter a total amount");
    if (Number(count) <= 0) return toast.error("At least 1 installment");
    setSaving(true);
    try {
      await createPaymentPlan({
        family: {
          family_key: familyKeyOf(anchor),
          parent_name: anchor.parentName,
          parent_email: anchor.parentEmail,
          parent_phone: anchor.parentPhone,
          school_name: anchor.schoolName,
          student_names: siblings.map((s) => s.studentName).join(", "),
        },
        total_amount: Number(total),
        down_payment: Number(down),
        installment_count: Number(count),
        frequency: freq,
        custom_days: freq === "Custom" ? Number(customDays) : null,
        start_date: startDate,
        notes,
      });
      toast.success("Payment plan created");
      await logAudit({
        action: `created payment plan (${formatCurrency(Number(total))})`,
        entityType: "payment_plan",
        entityName: anchor.parentName || anchor.studentName,
        details: { total, down, count, freq },
      });
      onCreated();
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader><DialogTitle>Create Payment Plan</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Total Registration ($)"><Input type="number" min={0} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label="Down Payment ($)"><Input type="number" min={0} step="0.01" value={down} onChange={(e) => setDown(e.target.value)} /></Field>
          <Field label="# of Installments"><Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
          <Field label="Frequency">
            <Select value={freq} onValueChange={(v) => setFreq(v as PlanFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Biweekly">Biweekly</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {freq === "Custom" && (
            <Field label="Custom interval (days)"><Input type="number" min={1} value={customDays} onChange={(e) => setCustomDays(e.target.value)} /></Field>
          )}
          <Field label="First Due Date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <div className="col-span-2">
            <Field label="Internal notes (optional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field>
          </div>
        </div>
        <Card className="bg-background border-border p-3 text-xs text-muted-foreground">
          Remaining after down: <span className="text-foreground font-medium tabular-nums">{formatCurrency(remaining)}</span> ·
          {" "}Per installment: <span className="text-foreground font-medium tabular-nums">{formatCurrency(perInst)}</span>
        </Card>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Creating…" : "Create Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  open, onClose, plan, installment, onDone,
}: { open: boolean; onClose: () => void; plan: PaymentPlan | null; installment: PaymentInstallment | null; onDone: () => void }) {
  const suggested = installment ? Math.max(0, installment.amount - installment.amount_paid) : plan?.installment_amount ?? 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setAmount(String(suggested.toFixed(2))); setMethod("Cash"); setDate(new Date().toISOString().slice(0, 10)); setConfirm(""); setNotes(""); } }, [open, suggested]);

  if (!plan) return null;
  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount > 0");
    setSaving(true);
    try {
      await recordPayment({
        plan_id: plan.id, installment_id: installment?.id ?? null,
        amount: amt, method, payment_date: date, kind: "Payment",
        notes, confirmation_number: confirm,
      });
      await logAudit({
        action: `recorded payment ${formatCurrency(amt)}`,
        entityType: "payment_plan", entityId: plan.id, entityName: plan.parent_name,
        details: { method, date, confirm, installment_id: installment?.id ?? null },
      });
      toast.success("Payment recorded");
      onDone();
    } catch (e: any) { toast.error(`Failed: ${e?.message || e}`); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Record Payment {installment ? `· Installment #${installment.sequence}` : ""}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Amount ($)"><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Cash", "Check", "Card", "ACH", "Zelle", "Venmo", "Other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Confirmation #"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Optional" /></Field>
          <div className="col-span-2"><Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInstallmentDialog({
  open, onClose, installment, onSaved,
}: { open: boolean; onClose: () => void; installment: PaymentInstallment | null; onSaved: () => void }) {
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  useEffect(() => { if (installment) { setDue(installment.due_date); setAmount(String(installment.amount)); } }, [installment]);
  if (!installment) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Edit Installment #{installment.sequence}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Due Date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Amount ($)"><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={async () => {
            await updateInstallment(installment.id, { due_date: due, amount: Number(amount) });
            toast.success("Installment updated"); onSaved();
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaiveDialog({
  open, onClose, plan, installment, onDone,
}: { open: boolean; onClose: () => void; plan: PaymentPlan | null; installment: PaymentInstallment | null; onDone: () => void }) {
  const [reason, setReason] = useState("");
  if (!plan || !installment) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Waive Installment #{installment.sequence}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          Waiving will mark this installment as paid for {formatCurrency(installment.amount)} without recording a payment.
          The waiver is permanently saved to history.
        </div>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[80px]" placeholder="Required" /></Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={async () => {
            if (!reason.trim()) return toast.error("Reason required");
            await waiveInstallment(plan.id, installment.id, installment.amount - installment.amount_paid, reason);
            toast.success("Installment waived"); onDone();
          }}>Waive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
