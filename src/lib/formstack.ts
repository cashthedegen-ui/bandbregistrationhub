import type { FormMeta, StudentRow } from "./types";

const CORS_PROXY = "https://corsproxy.io/?";

async function proxy(url: string, token: string) {
  const res = await fetch(`${CORS_PROXY}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Formstack ${res.status}`);
  return res.json();
}

export async function fetchForms(token: string): Promise<any[]> {
  const data = await proxy("https://www.formstack.com/api/v2/form.json", token);
  return data?.forms || [];
}

export interface SchoolFormCfg { schoolLabel: string; formId: string; }

export async function fetchAllSubmissions(
  cfgs: SchoolFormCfg[],
  token: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<StudentRow[]> {
  const total = cfgs.length;
  let done = 0;
  const all: StudentRow[] = [];
  await Promise.all(
    cfgs.map(async (cfg) => {
      try {
        if (!cfg.formId) { done++; onProgress?.(done, total, cfg.schoolLabel); return; }
        // Pull form fields to map labels -> field ids
        const form = await proxy(`https://www.formstack.com/api/v2/form/${cfg.formId}.json`, token);
        const fieldMap: Record<string, string> = {};
        for (const f of form?.fields || []) {
          fieldMap[(f.label || "").toLowerCase().trim()] = String(f.id);
        }
        // Pull submissions (first 250)
        const subs = await proxy(
          `https://www.formstack.com/api/v2/form/${cfg.formId}/submission.json?data=1&per_page=100`,
          token,
        );
        for (const sub of subs?.submissions || []) {
          const rows = expandSubmission(sub, fieldMap, cfg);
          all.push(...rows);
        }
      } catch (e) {
        console.error("Form fetch failed for", cfg.schoolLabel, e);
      } finally {
        done++;
        onProgress?.(done, total, cfg.schoolLabel);
      }
    }),
  );
  return all;
}

function getField(data: any[], fieldMap: Record<string, string>, ...labels: string[]): string {
  for (const label of labels) {
    const id = fieldMap[label.toLowerCase().trim()];
    if (!id) continue;
    const v = data?.find?.((d: any) => String(d.field) === id)?.value;
    if (v) return String(v);
  }
  // fallback: search by includes
  for (const label of labels) {
    const key = Object.keys(fieldMap).find((k) => k.includes(label.toLowerCase()));
    if (!key) continue;
    const id = fieldMap[key];
    const v = data?.find?.((d: any) => String(d.field) === id)?.value;
    if (v) return String(v);
  }
  return "";
}

function expandSubmission(sub: any, fm: Record<string, string>, cfg: SchoolFormCfg): StudentRow[] {
  const data = sub.data || [];
  const parentName = getField(data, fm, "Parent Name", "Parent");
  const parentAddress = getField(data, fm, "Address");
  const parentPhone = getField(data, fm, "Phone");
  const parentEmail = getField(data, fm, "Email");
  const stop1 = getField(data, fm, "Bus Stop Location 1st choice", "Bus Stop Location");
  const stop2 = getField(data, fm, "Bus Stop Location 2nd choice");
  const checkNumber = getField(data, fm, "Check Number", "Check #");
  const students: { name: string; grade: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const name = getField(data, fm, `Student Name ${i}`, `Student ${i} Name`, `Student Name ${i}`);
    const grade = getField(data, fm, `Student ${i} Grade`, `Student Grade ${i}`);
    if (name) students.push({ name, grade });
  }
  const notes = getField(data, fm, "Notes", "Medical", "Allergies");
  const alertFlag = /allerg|epipen|asthma|medical|peanut|diabet/i.test(notes);

  return students.map((s, idx) => ({
    id: `${sub.id}-${idx}`,
    submissionId: String(sub.id),
    formId: cfg.formId,
    schoolName: cfg.schoolLabel,
    studentName: s.name,
    grade: s.grade,
    stopAddress: stop1,
    stopAddress2: stop2,
    parentName,
    parentPhone,
    parentEmail,
    parentAddress,
    notes,
    alertFlag,
    duplicateFlag: false,
    status: "New" as const,
    submissionDate: sub.timestamp ? new Date(sub.timestamp).toISOString() : new Date().toISOString(),
    checkNumber,
  }));
}
