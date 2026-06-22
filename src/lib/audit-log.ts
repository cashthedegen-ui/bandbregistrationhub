import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  id: string;
  ts: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
}

export function actorNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Unknown";
  const local = email.split("@")[0] || email;
  // Pretty-cap (caleb -> Caleb, david.smith -> David Smith)
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join(" ") || email;
}

export async function logAudit(input: {
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const u = userRes.user;
    const { error } = await supabase.from("audit_log").insert({
      actor_id: u?.id ?? null,
      actor_email: u?.email ?? null,
      actor_name: actorNameFromEmail(u?.email),
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      entity_name: input.entityName ?? null,
      details: input.details ?? null,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[audit-log] write failed", e);
  }
}

export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as AuditEntry[]) ?? [];
}

export async function fetchAllAuditLog(): Promise<AuditEntry[]> {
  const all: AuditEntry[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .order("ts", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as AuditEntry[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
