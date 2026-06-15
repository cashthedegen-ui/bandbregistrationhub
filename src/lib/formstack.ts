import type { StudentRow } from "./types";

const PROXY = "/api/formstack";

async function proxy(url: string, token: string) {
  const res = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`, {
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

// Known field IDs from spec
const F = {
  parentName: "194977392",
  homeAddress: "194977393",
  parentPhone: "194977394",
  parentEmail: "194977395",
  studentCount: "194977397",
  student1Name: "194977398",
  student1Grade: "194977399",
  stop1: "194977405",
  stop2: "194977406",
  signature: "194977412",
  // Likely subsequent student fields (best-effort)
  student2Name: "194977400",
  student2Grade: "194977401",
  student3Name: "194977402",
  student3Grade: "194977403",
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

function pickValue(data: any, fieldId: string): string {
  if (!data) return "";
  // data can be array [{field,value}] or object {fieldId: {value}} depending on endpoint
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

export async function fetchAllSubmissions(
  cfgs: SchoolFormCfg[],
  token: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<StudentRow[]> {
  const all: StudentRow[] = [];

  // Step 1: collect all submission IDs (paginated) across all configured forms
  type IdRef = { id: string; timestamp?: string; cfg: SchoolFormCfg };
  const idRefs: IdRef[] = [];

  for (const cfg of cfgs) {
    if (!cfg.formId) continue;
    onProgress?.(0, 0, `Listing submissions for ${cfg.schoolLabel}…`);
    let page = 1;
    while (true) {
      const list = await proxy(
        `https://www.formstack.com/api/v2/form/${cfg.formId}/submission.json?per_page=25&page=${page}`,
        token,
      );
      const subs: any[] = list?.submissions || [];
      for (const s of subs) {
        idRefs.push({ id: String(s.id), timestamp: s.timestamp, cfg });
      }
      const pages = Number(list?.pages || 1);
      if (page >= pages || subs.length === 0) break;
      page++;
    }
  }

  const total = idRefs.length;
  let done = 0;
  onProgress?.(done, total, `Fetching 0 of ${total} submissions…`);

  // Step 2: fetch each submission's field data (batched for speed)
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < idRefs.length) {
      const i = cursor++;
      const ref = idRefs[i];
      try {
        const sub = await proxy(
          `https://www.formstack.com/api/v2/submission/${ref.id}.json`,
          token,
        );
        const rows = expandSubmission(sub, ref.cfg, ref.timestamp);
        all.push(...rows);
      } catch (e) {
        console.error("Submission fetch failed", ref.id, e);
      } finally {
        done++;
        onProgress?.(done, total, `Fetching ${done} of ${total} submissions…`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, idRefs.length) }, worker));

  return all;
}

function expandSubmission(sub: any, cfg: SchoolFormCfg, listTimestamp?: string): StudentRow[] {
  const data = sub?.data ?? [];
  const parentName = parseNameField(pickValue(data, F.parentName));
  const parentAddress = pickValue(data, F.homeAddress).replace(/\r?\n/g, ", ");
  const parentPhone = pickValue(data, F.parentPhone);
  const parentEmail = pickValue(data, F.parentEmail);
  const stop1 = pickValue(data, F.stop1);
  const stop2 = pickValue(data, F.stop2);
  const countRaw = pickValue(data, F.studentCount);
  const count = Math.max(1, Math.min(3, parseInt(countRaw, 10) || 1));

  const studentFields: Array<[string, string]> = [
    [F.student1Name, F.student1Grade],
    [F.student2Name, F.student2Grade],
    [F.student3Name, F.student3Grade],
  ];

  const students: { name: string; grade: string }[] = [];
  for (let i = 0; i < count; i++) {
    const [nId, gId] = studentFields[i];
    const name = parseNameField(pickValue(data, nId));
    const grade = pickValue(data, gId);
    if (name) students.push({ name, grade });
  }
  if (students.length === 0) {
    // ensure at least one row even if names missing
    students.push({ name: "(Unknown student)", grade: "" });
  }

  const ts = sub?.timestamp || listTimestamp || new Date().toISOString();

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
    notes: "",
    alertFlag: false,
    duplicateFlag: false,
    status: "New" as const,
    submissionDate: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    checkNumber: "",
  }));
}
