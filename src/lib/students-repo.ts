import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "./types";

const TABLE = "students";

export async function fetchAllStudents(): Promise<StudentRow[]> {
  const all: StudentRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r.data as unknown as StudentRow);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// Detects rows that look like a "wipe" — no payment data of any kind.
// Used as a safety guard so a stale client snapshot can never overwrite a
// remote row that has real payment data on it.
function isAllZeroPayment(r: StudentRow): boolean {
  const noType = !r.paymentType || r.paymentType === "Unpaid";
  const noAmounts =
    (r.amountPaid ?? 0) === 0 &&
    (r.rtAmount ?? 0) === 0 &&
    (r.owAmount ?? 0) === 0 &&
    (r.familyPaid ?? 0) === 0 &&
    (r.schoolOwes ?? 0) === 0 &&
    (r.schoolPaidAmount ?? 0) === 0;
  const noFlags =
    !r.schoolPaidReceived &&
    (!r.paymentStatus || r.paymentStatus === "Pending");
  return noType && noAmounts && noFlags;
}

function hasPaymentData(r: StudentRow | undefined): boolean {
  if (!r) return false;
  return !isAllZeroPayment(r);
}

async function fetchExistingById(ids: string[]): Promise<Map<string, StudentRow>> {
  const map = new Map<string, StudentRow>();
  if (ids.length === 0) return map;
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await supabase.from(TABLE).select("id,data").in("id", slice);
    if (error) throw error;
    for (const r of data ?? []) map.set(r.id as string, r.data as unknown as StudentRow);
  }
  return map;
}

export async function upsertStudent(row: StudentRow): Promise<void> {
  // Per-row guard: if the incoming row has no payment data but the remote
  // row does, refuse the write. This protects against a single edit that
  // would accidentally clear payment fields.
  if (isAllZeroPayment(row)) {
    const { data: existing } = await supabase.from(TABLE).select("data").eq("id", row.id).maybeSingle();
    const remoteRow = (existing?.data as unknown as StudentRow | undefined) ?? undefined;
    if (hasPaymentData(remoteRow)) {
      console.warn("[students-repo] refused to overwrite row with payment data using all-zero snapshot", row.id);
      throw new Error("Refused to overwrite existing payment data with empty values. Refresh and try again.");
    }
  }
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        id: row.id,
        data: row as any,
        updated_at: new Date().toISOString(),
        updated_by: userRes.user?.id ?? null,
      },
      { onConflict: "id" },
    );
  if (error) throw error;
}

export async function upsertStudents(rows: StudentRow[], opts: { force?: boolean } = {}): Promise<void> {
  if (rows.length === 0) return;
  let toWrite = rows;
  if (!opts.force) {
    // Batch guard: drop any row from the batch whose incoming payment fields
    // are empty AND whose remote row has real payment data on it.
    const existing = await fetchExistingById(rows.map((r) => r.id));
    const skipped: string[] = [];
    toWrite = rows.filter((r) => {
      if (!isAllZeroPayment(r)) return true;
      if (hasPaymentData(existing.get(r.id))) {
        skipped.push(r.id);
        return false;
      }
      return true;
    });
    if (skipped.length > 0) {
      console.warn(`[students-repo] skipped ${skipped.length} all-zero upserts to protect remote payment data`, skipped);
    }
    if (toWrite.length === 0) return;
  }
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const now = new Date().toISOString();
  const batchSize = 200;
  for (let i = 0; i < toWrite.length; i += batchSize) {
    const batch = toWrite.slice(i, i + batchSize).map((r) => ({
      id: r.id,
      data: r as any,
      updated_at: now,
      updated_by: uid,
    }));
    const { error } = await supabase.from(TABLE).upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function deleteStudentRow(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllStudents(): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().neq("id", "__never__");
  if (error) throw error;
}

export function subscribeStudents(handlers: {
  onUpsert: (row: StudentRow) => void;
  onDelete: (id: string) => void;
}) {
  const channel = supabase
    .channel("students_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as { id?: string } | null;
          if (oldRow?.id) handlers.onDelete(oldRow.id);
        } else {
          const newRow = payload.new as { data?: StudentRow } | null;
          if (newRow?.data) handlers.onUpsert(newRow.data);
        }
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}