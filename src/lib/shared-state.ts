import { supabase } from "@/integrations/supabase/client";

export type SharedKey =
  | "students"
  | "archives"
  | "stopCapacities"
  | "syncHistory"
  | "deletedSubmissions"
  | "lastSync"
  | "settings";

export async function loadShared<T>(key: SharedKey, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fallback;
    return (data.value as T) ?? fallback;
  } catch (e) {
    console.warn("[shared-state] load failed", key, e);
    return fallback;
  }
}

export async function saveShared<T>(key: SharedKey, value: T): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_state")
      .upsert(
        { key, value: value as any, updated_at: new Date().toISOString(), updated_by: userRes.user?.id ?? null },
        { onConflict: "key" },
      );
    if (error) throw error;
  } catch (e) {
    console.warn("[shared-state] save failed", key, e);
  }
}

export function subscribeShared(onChange: (key: SharedKey, value: unknown) => void) {
  const channel = supabase
    .channel("app_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state" },
      (payload) => {
        const row = (payload.new ?? payload.old) as { key?: string; value?: unknown } | null;
        if (row?.key) onChange(row.key as SharedKey, (payload.new as any)?.value);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}