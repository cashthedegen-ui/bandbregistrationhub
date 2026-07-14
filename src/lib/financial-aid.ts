import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "./types";

/**
 * Financial Aid helpers. Source of truth = existing student fields on StudentRow:
 *   - familyPaid          → Family Paid (family's contribution to the bus cost)
 *   - schoolOwes          → Original School Responsibility (portion owed by school)
 *   - schoolPaidAmount    → cumulative school payments collected
 *   - schoolPaidReceived  → flag that at least one school payment landed
 *
 * All Financial Aid surfaces (KPIs, school summary, student table, drawer, exports)
 * use `totalsForStudent` so numbers stay synchronized across views.
 */

export interface FinancialAidHistoryEntry {
  id: string;
  student_id: string | null;
  family_key: string | null;
  action: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  notes: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
}

export function isFinancialAid(s: StudentRow): boolean {
  return s.paymentType === "Financial Aid";
}

export type DerivedPaymentStatus = "Paid" | "Partially Paid" | "Unpaid";

export interface FinancialAidTotals {
  totalBusCost: number;       // familyPaid + original school responsibility
  familyPaid: number;         // from StudentRow.familyPaid (same field as Students page)
  schoolPaid: number;         // cumulative school payments collected
  schoolBalance: number;      // MAX(totalBusCost - familyPaid - schoolPaid, 0)
  collected: number;          // familyPaid + schoolPaid
  outstanding: number;        // MAX(totalBusCost - collected, 0)
  paymentStatus: DerivedPaymentStatus;

  // Legacy aliases retained so older callers keep compiling.
  awardAmount: number;
  familyResponsibility: number;
  amountCollected: number;
}

export function totalsForStudent(s: StudentRow): FinancialAidTotals {
  const familyPaid = Number(s.familyPaid ?? 0);
  const schoolOwesOriginal = Number(s.schoolOwes ?? 0);
  const totalBusCost = familyPaid + schoolOwesOriginal;
  // schoolPaidAmount is treated as cumulative collected from the school.
  const schoolPaid = Number(s.schoolPaidAmount ?? 0);
  const collected = familyPaid + schoolPaid;
  const schoolBalance = Math.max(0, totalBusCost - familyPaid - schoolPaid);
  const outstanding = Math.max(0, totalBusCost - collected);

  let paymentStatus: DerivedPaymentStatus;
  if (totalBusCost > 0 && collected >= totalBusCost) paymentStatus = "Paid";
  else if (collected > 0) paymentStatus = "Partially Paid";
  else paymentStatus = "Unpaid";

  return {
    totalBusCost,
    familyPaid,
    schoolPaid,
    schoolBalance,
    collected,
    outstanding,
    paymentStatus,
    // legacy aliases
    awardAmount: totalBusCost,
    familyResponsibility: familyPaid,
    amountCollected: collected,
  };
}

export async function logFinancialAidHistory(input: {
  student_id?: string | null;
  family_key?: string | null;
  action: string;
  previous_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  notes?: string | null;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const u = userRes.user;
  const actor_name = (u?.email || "").split("@")[0] || "Staff";
  const { error } = await supabase.from("financial_aid_history" as any).insert({
    student_id: input.student_id ?? null,
    family_key: input.family_key ?? null,
    action: input.action,
    previous_values: input.previous_values ?? null,
    new_values: input.new_values ?? null,
    notes: input.notes ?? null,
    actor_id: u?.id ?? null,
    actor_email: u?.email ?? "",
    actor_name,
  });
  if (error) {
    // Non-fatal: history is nice-to-have. Log and continue.
    console.error("logFinancialAidHistory failed", error);
  }
}

export async function fetchHistoryForStudent(student_id: string): Promise<FinancialAidHistoryEntry[]> {
  const { data, error } = await supabase.from("financial_aid_history" as any)
    .select("*").eq("student_id", student_id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}
