import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "./types";

export type PlanFrequency = "Monthly" | "Biweekly" | "Weekly" | "Custom";
export type PlanStatus = "Current" | "Upcoming" | "Overdue" | "Paid Off" | "Cancelled" | "Removed by Admin";
export type BillingType = "Paid in Full" | "Payment Plan" | "Financial Aid" | "Unpaid";
export type InstallmentStatus = "Upcoming" | "Due" | "Paid" | "Overdue" | "Waived";
export type PaymentMethod = "Cash" | "Check" | "Card" | "ACH" | "Zelle" | "Venmo" | "Other";
export type PaymentKind = "Payment" | "DownPayment" | "Waive" | "Credit";

export interface PaymentPlan {
  id: string;
  family_key: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  school_name: string;
  student_names: string;
  total_amount: number;
  down_payment: number;
  installment_count: number;
  installment_amount: number;
  frequency: PlanFrequency;
  custom_days: number | null;
  start_date: string;
  next_due_date: string | null;
  last_payment_date: string | null;
  amount_paid: number;
  remaining_balance: number;
  status: PlanStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  cancelled_by_email?: string | null;
  billing_type_after?: BillingType | null;
}

export interface FamilyBilling {
  id: string;
  family_key: string;
  parent_name: string;
  parent_email: string;
  school_name: string;
  student_names: string;
  billing_type: BillingType;
  updated_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface BillingChange {
  id: string;
  family_key: string;
  parent_name: string;
  previous_type: string | null;
  new_type: string;
  reason: string;
  plan_id: string | null;
  actor_email: string;
  actor_name: string;
  created_at: string;
}

export interface PaymentInstallment {
  id: string;
  plan_id: string;
  sequence: number;
  due_date: string;
  amount: number;
  amount_paid: number;
  status: InstallmentStatus;
  waived: boolean;
  paid_at: string | null;
  notes: string;
}

export interface PaymentRecord {
  id: string;
  plan_id: string;
  installment_id: string | null;
  payment_date: string;
  amount: number;
  method: PaymentMethod | string;
  confirmation_number: string;
  notes: string;
  staff_id: string | null;
  staff_email: string;
  staff_name: string;
  kind: PaymentKind;
  created_at: string;
}

/** Stable family key. Prefer parent email; fall back to parent name + school. */
export function familyKeyOf(row: Pick<StudentRow, "parentEmail" | "parentName" | "schoolName">): string {
  const email = (row.parentEmail || "").toLowerCase().trim();
  if (email) return `e:${email}`;
  const name = (row.parentName || "").toLowerCase().trim();
  const school = (row.schoolName || "").toLowerCase().trim();
  return `n:${name}|${school}`;
}

export function familySiblings(students: StudentRow[], key: string): StudentRow[] {
  return students.filter((s) => familyKeyOf(s) === key);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function frequencyDays(freq: PlanFrequency, custom?: number | null): number {
  if (freq === "Weekly") return 7;
  if (freq === "Biweekly") return 14;
  if (freq === "Monthly") return 30;
  return Math.max(1, Number(custom) || 30);
}

/** Generate evenly spaced installments for a new plan. */
export function buildInstallmentSchedule(input: {
  start_date: string;
  installment_count: number;
  installment_amount: number;
  frequency: PlanFrequency;
  custom_days?: number | null;
}): Array<{ sequence: number; due_date: string; amount: number }> {
  const step = frequencyDays(input.frequency, input.custom_days);
  const rows: Array<{ sequence: number; due_date: string; amount: number }> = [];
  for (let i = 0; i < input.installment_count; i++) {
    rows.push({
      sequence: i + 1,
      due_date: addDays(input.start_date, step * i),
      amount: Number(input.installment_amount.toFixed(2)),
    });
  }
  return rows;
}

export function computeNextDue(installments: PaymentInstallment[]): { next: PaymentInstallment | null; remaining: number } {
  const open = installments
    .filter((i) => !i.waived && i.status !== "Paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return { next: open[0] ?? null, remaining: open.length };
}

export function computePlanStatus(plan: { remaining_balance: number }, installments: PaymentInstallment[]): PlanStatus {
  if (plan.remaining_balance <= 0.005) return "Paid Off";
  const today = new Date().toISOString().slice(0, 10);
  const hasOverdue = installments.some((i) => !i.waived && i.status !== "Paid" && i.due_date < today);
  if (hasOverdue) return "Overdue";
  const hasDueSoon = installments.some((i) => !i.waived && i.status !== "Paid" && i.due_date <= addDays(today, 7));
  return hasDueSoon ? "Current" : "Upcoming";
}

// =================== Supabase CRUD ===================

export async function fetchAllPlans(): Promise<PaymentPlan[]> {
  const { data, error } = await supabase.from("payment_plans").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}

export async function fetchPlanByFamily(family_key: string): Promise<PaymentPlan | null> {
  const { data, error } = await supabase.from("payment_plans")
    .select("*").eq("family_key", family_key)
    .not("status", "in", "(Cancelled,Removed by Admin)")
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function fetchCancelledPlansByFamily(family_key: string): Promise<PaymentPlan[]> {
  const { data, error } = await supabase.from("payment_plans")
    .select("*").eq("family_key", family_key)
    .in("status", ["Cancelled", "Removed by Admin"])
    .order("cancelled_at", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}

export async function fetchInstallments(plan_id: string): Promise<PaymentInstallment[]> {
  const { data, error } = await supabase.from("payment_installments").select("*").eq("plan_id", plan_id).order("sequence");
  if (error) throw error;
  return (data as any) ?? [];
}

export async function fetchRecords(plan_id: string): Promise<PaymentRecord[]> {
  const { data, error } = await supabase.from("payment_records").select("*").eq("plan_id", plan_id).order("payment_date", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}

export interface CreatePlanInput {
  family: { family_key: string; parent_name: string; parent_email: string; parent_phone: string; school_name: string; student_names: string };
  total_amount: number;
  down_payment: number;
  installment_count: number;
  frequency: PlanFrequency;
  custom_days?: number | null;
  start_date: string;
  notes?: string;
}

export async function createPaymentPlan(input: CreatePlanInput): Promise<PaymentPlan> {
  const remainingAfterDown = Math.max(0, input.total_amount - input.down_payment);
  const installment_amount = input.installment_count > 0 ? remainingAfterDown / input.installment_count : 0;
  const schedule = buildInstallmentSchedule({
    start_date: input.start_date,
    installment_count: input.installment_count,
    installment_amount,
    frequency: input.frequency,
    custom_days: input.custom_days,
  });

  const { data: plan, error } = await supabase
    .from("payment_plans")
    .insert({
      family_key: input.family.family_key,
      parent_name: input.family.parent_name,
      parent_email: input.family.parent_email,
      parent_phone: input.family.parent_phone,
      school_name: input.family.school_name,
      student_names: input.family.student_names,
      total_amount: input.total_amount,
      down_payment: input.down_payment,
      installment_count: input.installment_count,
      installment_amount: Number(installment_amount.toFixed(2)),
      frequency: input.frequency,
      custom_days: input.custom_days ?? null,
      start_date: input.start_date,
      next_due_date: schedule[0]?.due_date ?? null,
      amount_paid: input.down_payment,
      remaining_balance: remainingAfterDown,
      status: remainingAfterDown <= 0 ? "Paid Off" : "Current",
      notes: input.notes ?? "",
    })
    .select()
    .single();
  if (error) throw error;

  if (schedule.length > 0) {
    const { error: ie } = await supabase.from("payment_installments").insert(
      schedule.map((s) => ({ plan_id: (plan as any).id, ...s })),
    );
    if (ie) throw ie;
  }

  if (input.down_payment > 0) {
    await recordPayment({
      plan_id: (plan as any).id,
      installment_id: null,
      amount: input.down_payment,
      method: "Cash",
      payment_date: input.start_date,
      kind: "DownPayment",
      notes: "Initial down payment",
      confirmation_number: "",
    });
  }

  return plan as any;
}

export async function recordPayment(input: {
  plan_id: string;
  installment_id: string | null;
  amount: number;
  method: string;
  payment_date: string;
  kind?: PaymentKind;
  notes?: string;
  confirmation_number?: string;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const u = userRes.user;
  const staff_name = (u?.email || "").split("@")[0] || "Staff";

  const { error } = await supabase.from("payment_records").insert({
    plan_id: input.plan_id,
    installment_id: input.installment_id,
    amount: input.amount,
    method: input.method,
    payment_date: input.payment_date,
    kind: input.kind ?? "Payment",
    notes: input.notes ?? "",
    confirmation_number: input.confirmation_number ?? "",
    staff_id: u?.id ?? null,
    staff_email: u?.email ?? "",
    staff_name,
  });
  if (error) throw error;

  // Recompute the plan + installment after the record is saved.
  await recalcPlan(input.plan_id);
}

/** Recompute amount_paid, remaining_balance, installment statuses, next_due_date, status. */
export async function recalcPlan(plan_id: string): Promise<void> {
  const [plan, installments, records] = await Promise.all([
    supabase.from("payment_plans").select("*").eq("id", plan_id).single(),
    fetchInstallments(plan_id),
    fetchRecords(plan_id),
  ]);
  if (plan.error || !plan.data) return;
  const p = plan.data as any as PaymentPlan;

  const totalPaid = records.reduce((sum, r) => sum + (r.kind === "Waive" ? 0 : Number(r.amount || 0)), 0);
  const totalWaived = records.filter((r) => r.kind === "Waive").reduce((s, r) => s + Number(r.amount || 0), 0);
  const remaining = Math.max(0, Number(p.total_amount) - totalPaid - totalWaived);

  // Distribute paid amount across installments in order (after subtracting the down payment).
  const downRecords = records.filter((r) => r.kind === "DownPayment").reduce((s, r) => s + Number(r.amount || 0), 0);
  let appliedToInstallments = Math.max(0, totalPaid - downRecords) + totalWaived;
  const today = new Date().toISOString().slice(0, 10);

  for (const inst of installments) {
    if (inst.waived) continue;
    const owed = Number(inst.amount);
    const pay = Math.min(appliedToInstallments, owed);
    appliedToInstallments -= pay;
    const fullyPaid = pay >= owed - 0.005;
    let status: InstallmentStatus = inst.status;
    let amount_paid = Number(pay.toFixed(2));
    if (fullyPaid) status = "Paid";
    else if (inst.due_date < today) status = "Overdue";
    else if (inst.due_date <= addDays(today, 7)) status = "Due";
    else status = "Upcoming";

    if (status !== inst.status || amount_paid !== Number(inst.amount_paid)) {
      await supabase.from("payment_installments")
        .update({ status, amount_paid, paid_at: fullyPaid ? (inst.paid_at || new Date().toISOString()) : null })
        .eq("id", inst.id);
    }
  }

  const fresh = await fetchInstallments(plan_id);
  const { next } = computeNextDue(fresh);
  const lastPayment = records.filter((r) => r.kind !== "Waive").sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0];
  const status = computePlanStatus({ remaining_balance: remaining }, fresh);

  await supabase.from("payment_plans").update({
    amount_paid: Number(totalPaid.toFixed(2)),
    remaining_balance: Number(remaining.toFixed(2)),
    next_due_date: next?.due_date ?? null,
    last_payment_date: lastPayment?.payment_date ?? null,
    status,
  }).eq("id", plan_id);
}

export async function updateInstallment(id: string, patch: Partial<Pick<PaymentInstallment, "due_date" | "amount" | "notes" | "waived" | "status">>): Promise<void> {
  const { error } = await supabase.from("payment_installments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function waiveInstallment(plan_id: string, installment_id: string, amount: number, reason: string): Promise<void> {
  await supabase.from("payment_installments").update({ waived: true, status: "Waived" }).eq("id", installment_id);
  await recordPayment({
    plan_id, installment_id, amount, method: "N/A", payment_date: new Date().toISOString().slice(0, 10),
    kind: "Waive", notes: reason || "Installment waived",
  });
}

export async function applyCredit(plan_id: string, amount: number, notes: string): Promise<void> {
  await recordPayment({
    plan_id, installment_id: null, amount, method: "Credit", payment_date: new Date().toISOString().slice(0, 10),
    kind: "Credit", notes,
  });
}

export async function deletePlan(plan_id: string): Promise<void> {
  const { error } = await supabase.from("payment_plans").delete().eq("id", plan_id);
  if (error) throw error;
}

export async function updatePlanNotes(plan_id: string, notes: string): Promise<void> {
  await supabase.from("payment_plans").update({ notes }).eq("id", plan_id);
}

// =================== Cancellation & Billing Type ===================

export async function cancelPaymentPlan(input: {
  plan_id: string;
  family_key: string;
  parent_name: string;
  new_billing_type: BillingType;
  reason: string;
  removal_kind: "Cancelled" | "Removed by Admin";
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const u = userRes.user;
  const prev = await fetchFamilyBilling(input.family_key);

  const cancelled_at = new Date().toISOString();
  const { error: upErr } = await supabase.from("payment_plans").update({
    status: input.removal_kind,
    cancelled_at,
    cancelled_reason: input.reason,
    cancelled_by: u?.id ?? null,
    cancelled_by_email: u?.email ?? "",
    billing_type_after: input.new_billing_type,
    next_due_date: null,
  }).eq("id", input.plan_id);
  if (upErr) throw upErr;

  // Mark all payment records on this plan as excluded from live analytics.
  // History is preserved — payments remain visible in the drawer.
  const excludedReason = input.removal_kind === "Cancelled"
    ? "Payment plan cancelled"
    : "Payment plan removed";
  const { error: exErr } = await (supabase as any).from("payment_records").update({
    analytics_excluded: true,
    excluded_reason: excludedReason,
    removed_from_plan_at: cancelled_at,
    removed_by_staff: u?.email ?? "",
  }).eq("plan_id", input.plan_id);
  if (exErr) throw exErr;

  await upsertFamilyBilling({
    family_key: input.family_key,
    parent_name: input.parent_name,
    billing_type: input.new_billing_type,
  });

  const { error: aErr } = await supabase.from("billing_changes").insert({
    family_key: input.family_key,
    parent_name: input.parent_name,
    previous_type: prev?.billing_type ?? "Payment Plan",
    new_type: input.new_billing_type,
    reason: input.reason,
    plan_id: input.plan_id,
    actor_id: u?.id ?? null,
    actor_email: u?.email ?? "",
    actor_name: (u?.email || "").split("@")[0] || "Staff",
  });
  if (aErr) throw aErr;
}

export async function fetchFamilyBilling(family_key: string): Promise<FamilyBilling | null> {
  const { data, error } = await supabase.from("family_billing").select("*").eq("family_key", family_key).maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function fetchAllFamilyBilling(): Promise<FamilyBilling[]> {
  const { data, error } = await supabase.from("family_billing").select("*");
  if (error) throw error;
  return (data as any) ?? [];
}

export async function upsertFamilyBilling(input: {
  family_key: string;
  parent_name?: string;
  parent_email?: string;
  school_name?: string;
  student_names?: string;
  billing_type: BillingType;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes.user?.email ?? "";
  const { error } = await supabase.from("family_billing").upsert({
    family_key: input.family_key,
    parent_name: input.parent_name ?? "",
    parent_email: input.parent_email ?? "",
    school_name: input.school_name ?? "",
    student_names: input.student_names ?? "",
    billing_type: input.billing_type,
    updated_by: userRes.user?.id ?? null,
    updated_by_email: email,
  }, { onConflict: "family_key" });
  if (error) throw error;
}

export async function fetchBillingChanges(family_key: string): Promise<BillingChange[]> {
  const { data, error } = await supabase.from("billing_changes").select("*")
    .eq("family_key", family_key).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}
