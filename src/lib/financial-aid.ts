import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "./types";

/**
 * Financial Aid helpers. Reads existing student rows where paymentType === "Financial Aid".
 * All edits go through the normal students store; this module only adds an append-only
 * history log so the FA management page has a full audit trail.
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

export interface FinancialAidTotals {
  awardAmount: number;      // Total award (family portion + school portion)
  familyResponsibility: number;
  schoolBalance: number;    // How much school still owes
  amountCollected: number;  // Family paid + school paid
  outstanding: number;      // Award - collected
}

export function totalsForStudent(s: StudentRow): FinancialAidTotals {
  const familyResponsibility = Number(s.familyPaid ?? 0);
  const schoolOwes = Number(s.schoolOwes ?? 0);
  const awardAmount = familyResponsibility + schoolOwes;
  const schoolPaid = s.schoolPaidReceived ? Number(s.schoolPaidAmount ?? schoolOwes) : 0;
  const amountCollected = Number(s.amountPaid ?? 0) + schoolPaid;
  const schoolBalance = Math.max(0, schoolOwes - schoolPaid);
  const outstanding = Math.max(0, awardAmount - amountCollected);
  return { awardAmount, familyResponsibility, schoolBalance, amountCollected, outstanding };
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
