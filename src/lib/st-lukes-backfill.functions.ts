import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudentRow } from "./types";

const FORM_ID = "6503623";

const FIELDS = {
  parentName: "195090325",
  address: "195090326",
  phone: "195090327",
  email: "195090328",
  students: [
    { label: "Driver Name", name: "195090330", grade: "195090331" },
    { label: "Sibling 1", name: "195090333", grade: "195090334" },
    { label: "Sibling 2", name: "195090335", grade: "195090336" },
  ],
} as const;

type DbStudentRow = {
  id: string;
  data: StudentRow & Record<string, unknown>;
};

type SubmissionStudent = {
  index: number;
  label: string;
  name: string;
  grade: string;
  sourceRecordId: string;
};

export type RepairStLukesParkingShuttleResult = {
  scanned: number;
  repaired: number;
  skipped: number;
  unresolved: Array<{
    id: string;
    submissionId: string;
    parentName: string;
    reason: string;
  }>;
  repairedRecords: Array<{
    id: string;
    submissionId: string;
    before: string;
    after: string;
    grade: string;
  }>;
};

function parseNameField(raw: string): string {
  if (!raw) return "";
  const s = String(raw);
  if (!s.includes("=")) return s.trim();
  const parts = s.split(/\r?\n/);
  let first = "";
  let last = "";
  for (const p of parts) {
    const m = p.match(/^\s*(first|last|middle)\s*=\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "first") first = val;
    else if (key === "last") last = val;
  }
  return [first, last].filter(Boolean).join(" ").trim() || s.trim();
}

function pickValue(data: unknown, fieldId: string): string {
  if (!data || !fieldId) return "";
  if (Array.isArray(data)) {
    const hit = data.find((d: any) => String(d.field) === fieldId);
    return hit?.value != null ? String(hit.value) : "";
  }
  if (typeof data === "object") {
    const hit = (data as any)[fieldId];
    if (hit == null) return "";
    if (typeof hit === "object") return hit.value != null ? String(hit.value) : "";
    return String(hit);
  }
  return "";
}

function isUnnamed(value: unknown): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return !s || s === "(unnamed student)" || s === "(unknown student)";
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

async function fetchFormstackJson(path: string, token: string): Promise<any> {
  const res = await fetch(`https://www.formstack.com/api/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Formstack ${res.status}`);
  return res.json();
}

function extractSubmissionStudents(submission: any): SubmissionStudent[] {
  const data = submission?.data ?? [];
  const submissionId = String(submission?.id ?? "");
  return FIELDS.students.map((def, index) => ({
    index,
    label: def.label,
    name: parseNameField(pickValue(data, def.name)),
    grade: pickValue(data, def.grade),
    sourceRecordId: submissionId ? `${submissionId}-${index}` : String(index),
  }));
}

function chooseSubmissionStudent(row: DbStudentRow, submission: any): SubmissionStudent | null {
  const students = extractSubmissionStudents(submission).filter((s) => s.name);
  if (students.length === 0) return null;

  const sourceRecordId = String(
    row.data.sourceRecordId ??
      row.data.source_record_id ??
      row.data.formstackRecordId ??
      row.data.id ??
      row.id ??
      "",
  );
  const bySource = students.find((s) => sourceRecordId === s.sourceRecordId);
  if (bySource) return bySource;

  // Fallback for the legacy one-row imports: use the primary driver record.
  return students[0];
}

async function findSubmissionByParent(token: string, row: DbStudentRow): Promise<any | null> {
  const targetEmail = normalizeEmail(row.data.parentEmail);
  const targetPhone = normalizePhone(row.data.parentPhone);
  if (!targetEmail || !targetPhone) return null;

  const perPage = 100;
  let page = 1;
  let safety = 0;
  while (safety++ < 100) {
    const list = await fetchFormstackJson(`form/${FORM_ID}/submission.json?per_page=${perPage}&page=${page}`, token);
    const refs: any[] = list?.submissions || [];
    if (refs.length === 0) return null;

    for (const ref of refs) {
      const submission = await fetchFormstackJson(`submission/${ref.id}.json`, token);
      const data = submission?.data ?? [];
      const email = normalizeEmail(pickValue(data, FIELDS.email));
      const phone = normalizePhone(pickValue(data, FIELDS.phone));
      if (email === targetEmail && phone === targetPhone) return submission;
    }

    const total = Number(list?.total || 0);
    const pages = Number(list?.pages || 0);
    if (total > 0 && page * perPage >= total) return null;
    if (pages > 0 && page >= pages) return null;
    page++;
  }
  return null;
}

export const repairStLukesParkingShuttleNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepairStLukesParkingShuttleResult> => {
    const supabase = context.supabase as any;
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Only admins can run this repair.");

    const token = process.env.FORMSTACK_API_TOKEN || process.env.formstack_api_token || "";
    if (!token) throw new Error("Formstack access is not configured.");

    const rows: DbStudentRow[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("students").select("id,data").range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data ?? []) rows.push(row as DbStudentRow);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const formRows = rows.filter((row) => String(row.data?.formId ?? row.data?.source_form_id ?? "") === FORM_ID);
    const targets = formRows.filter((row) => isUnnamed(row.data?.studentName));
    const submissionCache = new Map<string, any>();
    const unresolved: RepairStLukesParkingShuttleResult["unresolved"] = [];
    const repairedRecords: RepairStLukesParkingShuttleResult["repairedRecords"] = [];
    let repaired = 0;
    let skipped = formRows.length - targets.length;

    for (const row of targets) {
      const submissionId = String(row.data?.submissionId ?? row.data?.source_submission_id ?? "").trim();
      let submission: any | null = null;

      if (submissionId) {
        try {
          if (!submissionCache.has(submissionId)) {
            submissionCache.set(submissionId, await fetchFormstackJson(`submission/${submissionId}.json`, token));
          }
          submission = submissionCache.get(submissionId);
        } catch (error: any) {
          unresolved.push({
            id: row.id,
            submissionId,
            parentName: row.data?.parentName || "",
            reason: `Could not fetch submission by ID: ${error?.message || error}`,
          });
        }
      }

      if (!submission) {
        try {
          submission = await findSubmissionByParent(token, row);
        } catch (error: any) {
          unresolved.push({
            id: row.id,
            submissionId,
            parentName: row.data?.parentName || "",
            reason: `Parent email + phone fallback failed: ${error?.message || error}`,
          });
        }
      }

      if (!submission) {
        skipped++;
        if (!unresolved.some((item) => item.id === row.id)) {
          unresolved.push({
            id: row.id,
            submissionId,
            parentName: row.data?.parentName || "",
            reason: "No matching Formstack submission found.",
          });
        }
        continue;
      }

      const mappedStudent = chooseSubmissionStudent(row, submission);
      if (!mappedStudent?.name) {
        skipped++;
        unresolved.push({
          id: row.id,
          submissionId: submissionId || String(submission?.id ?? ""),
          parentName: row.data?.parentName || "",
          reason: "No usable Driver Name value was found in the submission.",
        });
        continue;
      }

      const nextData: StudentRow & Record<string, unknown> = {
        ...row.data,
        studentName: mappedStudent.name,
        grade: mappedStudent.grade || row.data.grade || "",
      };

      const { error } = await supabase.from("students").update({ data: nextData }).eq("id", row.id);
      if (error) {
        skipped++;
        unresolved.push({
          id: row.id,
          submissionId: submissionId || String(submission?.id ?? ""),
          parentName: row.data?.parentName || "",
          reason: `Database update failed: ${error.message}`,
        });
        continue;
      }

      repaired++;
      repairedRecords.push({
        id: row.id,
        submissionId: submissionId || String(submission?.id ?? ""),
        before: String(row.data.studentName ?? ""),
        after: mappedStudent.name,
        grade: nextData.grade,
      });
    }

    return {
      scanned: formRows.length,
      repaired,
      skipped,
      unresolved,
      repairedRecords,
    };
  });