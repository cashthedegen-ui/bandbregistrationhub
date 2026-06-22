import { supabase } from "@/integrations/supabase/client";
import { fetchAllAuditLog } from "./audit-log";

async function fetchAllRowsFromTable<T = unknown>(table: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table as any).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function buildFullBackup(): Promise<Record<string, unknown>> {
  const [students, appState, formsConfig, syncHistoryRows, userRoles, auditLog] = await Promise.all([
    fetchAllRowsFromTable("students"),
    fetchAllRowsFromTable("app_state"),
    fetchAllRowsFromTable("forms_config"),
    fetchAllRowsFromTable("sync_history"),
    fetchAllRowsFromTable("user_roles"),
    fetchAllAuditLog(),
  ]);
  return {
    meta: {
      app: "B & B Transit",
      exportedAt: new Date().toISOString(),
      version: 1,
    },
    students,
    app_state: appState,
    forms_config: formsConfig,
    sync_history: syncHistoryRows,
    user_roles: userRoles,
    audit_log: auditLog,
  };
}

export async function downloadFullBackup(): Promise<{ filename: string; size: number }> {
  const payload = await buildFullBackup();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `bb-transit-backup-${date}.json`;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, size: blob.size };
}
