import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "./types";

const TABLE = "students";

export async function fetchAllStudents(): Promise<StudentRow[]> {
  const all: StudentRow[] = [];
  const pageSize = 1000;
  let from = 0;
  // page through in case > 1000
  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r.data as StudentRow);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function upsertStudent(row: StudentRow): Promise<void> {
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

export async function upsertStudents(rows: StudentRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const now = new Date().toISOString();
  // batch to avoid huge payloads
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((r) => ({
      id: r.id,
      data: r as any,
      updated_at: now,
      updated_by: uid,
    }));
    const { error } = await supabase
      .from(TABLE)
      .upsert(batch, { onConflict: "id" });
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
