// Client-side helpers for the Automation Center.
// Uses the authenticated browser Supabase client; RLS limits access to signed-in staff.
import { supabase } from "@/integrations/supabase/client";

export interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  description: string | null;
  updated_at: string;
}

export interface SchoolContact {
  id: string;
  school_name: string;
  contact_name: string;
  title: string;
  email: string;
  phone: string;
  notes: string;
}

export interface EmailHistoryRow {
  id: string;
  template_key: string | null;
  recipient: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  status: string;
  error: string | null;
  resend_id: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string;
}

export interface AutomationConfig {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updated_at: string;
}

const s = supabase as unknown as {
  from: (t: string) => any;
};

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await s.from("email_templates").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

export async function saveTemplate(t: Pick<EmailTemplate, "key" | "name" | "subject" | "body_html"> & Partial<EmailTemplate>) {
  const { error } = await s.from("email_templates").upsert({
    key: t.key,
    name: t.name,
    subject: t.subject,
    body_html: t.body_html,
    body_text: t.body_text ?? "",
    description: t.description ?? null,
  });
  if (error) throw error;
}

export async function fetchContacts(): Promise<SchoolContact[]> {
  const { data, error } = await s.from("school_contacts").select("*").order("school_name").order("contact_name");
  if (error) throw error;
  return (data ?? []) as SchoolContact[];
}

export async function saveContact(c: Partial<SchoolContact> & { school_name: string }) {
  if (c.id) {
    const { error } = await s.from("school_contacts").update({
      school_name: c.school_name,
      contact_name: c.contact_name ?? "",
      title: c.title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
    }).eq("id", c.id);
    if (error) throw error;
  } else {
    const { error } = await s.from("school_contacts").insert({
      school_name: c.school_name,
      contact_name: c.contact_name ?? "",
      title: c.title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
    });
    if (error) throw error;
  }
}

export async function deleteContact(id: string) {
  const { error } = await s.from("school_contacts").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchHistory(opts: { limit?: number; status?: string; template?: string; search?: string } = {}): Promise<EmailHistoryRow[]> {
  let q = s.from("email_history").select("*").order("sent_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.template && opts.template !== "all") q = q.eq("template_key", opts.template);
  if (opts.search) q = q.or(`recipient.ilike.%${opts.search}%,subject.ilike.%${opts.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmailHistoryRow[];
}

export async function fetchConfigs(): Promise<AutomationConfig[]> {
  const { data, error } = await s.from("automation_configs").select("*").order("key");
  if (error) throw error;
  return (data ?? []) as AutomationConfig[];
}

export async function saveConfig(key: string, enabled: boolean, config: Record<string, unknown>) {
  const { error } = await s.from("automation_configs").upsert({ key, enabled, config });
  if (error) throw error;
}
