import type { StudentRow } from "./types";

const PROXY = "/api/formstack";

async function proxy(url: string, _token?: string) {
  const res = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Formstack ${res.status}`);
  return res.json();
}

export async function fetchForms(_token?: string): Promise<any[]> {
  const data = await proxy("https://www.formstack.com/api/v2/form.json");
  return data?.forms || [];
}

export interface SchoolFormCfg {
  schoolLabel: string;
  formId: string;
}

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

function parseAddressField(raw: string): string {
  if (!raw) return "";
  const s = String(raw);
  if (!s.includes("=")) return s.replace(/\r?\n/g, ", ").trim();
  const parts = s.split(/\r?\n|,/);
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const m = p.match(/^\s*([a-z0-9_ ]+?)\s*=\s*(.*)$/i);
    if (!m) continue;
    kv[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const street = [kv["address"], kv["address2"] || kv["address 2"]].filter(Boolean).join(" ");
  const city = kv["city"] || "";
  const state = kv["state"] || "";
  const zip = kv["zip"] || kv["zip code"] || kv["postal"] || "";
  const tail = [state, zip].filter(Boolean).join(" ");
  const out = [street, city, tail].filter(Boolean).join(", ");
  return out || s.replace(/\r?\n/g, ", ").trim();
}

function pickValue(data: any, fieldId: string): string {
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

// ---- Dynamic field mapping ----

interface FieldDef {
  id: string;
  label: string;
  internal_label?: string;
  name?: string;
  type?: string;
  section?: string;
}

interface FormMapping {
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  parentAddress: string;
  studentCount: string;
  students: Array<{ name: string; grade: string }>;
  stops: string[];
}

function norm(s: string | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findField(
  fields: FieldDef[],
  matchers: Array<RegExp | string>,
  opts: { type?: string; skipIds?: Set<string> } = {},
): string {
  for (const m of matchers) {
    for (const f of fields) {
      if (opts.skipIds?.has(f.id)) continue;
      if (opts.type && f.type && f.type !== opts.type) continue;
      const hay = `${norm(f.label)} | ${norm(f.internal_label)} | ${norm(f.name)}`;
      const ok = typeof m === "string" ? hay.includes(m) : m.test(hay);
      if (ok) return f.id;
    }
  }
  return "";
}

function buildMapping(fields: FieldDef[]): FormMapping {
  const used = new Set<string>();
  const take = (id: string) => {
    if (id) used.add(id);
    return id;
  };

  const parentName = take(
    findField(fields, [/\bparent\b.*name|guardian.*name|\bparent\/guardian\b/, /^name$/, /full name/], {
      skipIds: used,
    }),
  );
  const parentPhone = take(
    findField(fields, [/parent.*phone|guardian.*phone|\bphone\b|mobile|cell/], { skipIds: used }),
  );
  const parentEmail = take(findField(fields, [/email/], { skipIds: used }));
  const parentAddress = take(
    findField(fields, [/home address|parent address|mailing address|\baddress\b/], { skipIds: used }),
  );
  const studentCount = take(
    findField(fields, [/number of (students|children|riders)|how many (students|children|riders)|student count/], {
      skipIds: used,
    }),
  );

  // Student name/grade pairs — collect all "student N name" + "student N grade"
  const students: Array<{ name: string; grade: string }> = [];
  for (let i = 1; i <= 6; i++) {
    const nameRe = new RegExp(`student\\s*${i}.*name|child\\s*${i}.*name|rider\\s*${i}.*name|name.*student\\s*${i}`);
    const gradeRe = new RegExp(`student\\s*${i}.*grade|child\\s*${i}.*grade|rider\\s*${i}.*grade|grade.*student\\s*${i}`);
    const nId = take(findField(fields, [nameRe], { skipIds: used }));
    const gId = take(findField(fields, [gradeRe], { skipIds: used }));
    if (nId || gId) students.push({ name: nId, grade: gId });
  }
  // Fallback: if none found, look for any name + grade pair
  if (students.length === 0) {
    const nId = take(findField(fields, [/student.*name|child.*name|rider.*name/], { skipIds: used }));
    const gId = take(findField(fields, [/grade|class|year/], { skipIds: used }));
    if (nId || gId) students.push({ name: nId, grade: gId });
  }

  // Bus stops
  const stops: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const re = new RegExp(`(bus )?stop\\s*${i}|pickup\\s*${i}|drop\\s*off\\s*${i}|afternoon|morning`);
    const id = take(findField(fields, [re], { skipIds: used }));
    if (id) stops.push(id);
  }
  if (stops.length === 0) {
    const id = take(findField(fields, [/stop|pickup|drop\s*off/], { skipIds: used }));
    if (id) stops.push(id);
  }

  return { parentName, parentPhone, parentEmail, parentAddress, studentCount, students, stops };
}

// Hardcoded mapping for Hopkins School Bus Enrollment 26-27 (form 6500704)
const HARDCODED_MAPPINGS: Record<string, FormMapping> = {
  "6500704": {
    parentName: "194977392",
    parentAddress: "194977393",
    parentPhone: "194977394",
    parentEmail: "194977395",
    studentCount: "194977397",
    students: [
      { name: "194977398", grade: "194977399" },
      { name: "194977400", grade: "194977401" },
      { name: "194977402", grade: "194977403" },
    ],
    stops: ["194977405", "194977406"],
  },
  "6499950": {
    parentName: "194947333",
    parentAddress: "194947334",
    parentPhone: "194947335",
    parentEmail: "194947336",
    studentCount: "194947338",
    students: [{ name: "194947339", grade: "194947340" }],
    stops: ["194947346"],
  },
  "6515338": {
    parentName: "195516091",
    parentAddress: "195516092",
    parentPhone: "195516093",
    parentEmail: "195516094",
    studentCount: "195516098",
    students: [{ name: "195516099", grade: "195516100" }],
    stops: ["195516107"],
  },
  "6515339": {
    parentName: "195516121",
    parentAddress: "195516122",
    parentPhone: "195516123",
    parentEmail: "195516124",
    studentCount: "195516128",
    students: [{ name: "195516129", grade: "195516130" }],
    stops: ["195516137"],
  },
  "6515340": {
    parentName: "195516151",
    parentAddress: "195516152",
    parentPhone: "195516153",
    parentEmail: "195516154",
    studentCount: "195516158",
    students: [{ name: "195516159", grade: "195516160" }],
    stops: ["195516167"],
  },
  "6503621": {
    parentName: "195090260",
    parentAddress: "195090261",
    parentPhone: "195090262",
    parentEmail: "195090263",
    studentCount: "195090264",
    students: [
      { name: "195090265", grade: "195090266" },
      { name: "195090268", grade: "195090269" },
      { name: "195090271", grade: "195090272" },
    ],
    stops: ["195090275"],
  },
};


async function fetchFormMapping(formId: string, token: string): Promise<FormMapping> {
  if (HARDCODED_MAPPINGS[formId]) return HARDCODED_MAPPINGS[formId];
  const form = await proxy(`https://www.formstack.com/api/v2/form/${formId}.json`, token);
  const fields: FieldDef[] = (form?.fields || []).map((f: any) => ({
    id: String(f.id),
    label: f.label || "",
    internal_label: f.internal_label || "",
    name: f.name || "",
    type: f.type || "",
    section: f.section || "",
  }));
  return buildMapping(fields);
}

export async function fetchAllSubmissions(
  cfgs: SchoolFormCfg[],
  token: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<StudentRow[]> {
  const all: StudentRow[] = [];

  // Step 1: build field mapping per form + collect submission IDs
  type IdRef = { id: string; timestamp?: string; cfg: SchoolFormCfg };
  const idRefs: IdRef[] = [];
  const mappings = new Map<string, FormMapping>();

  for (const cfg of cfgs) {
    if (!cfg.formId) continue;
    onProgress?.(0, 0, `Loading field map for ${cfg.schoolLabel}…`);
    try {
      const map = await fetchFormMapping(cfg.formId, token);
      mappings.set(cfg.formId, map);
    } catch (e) {
      console.error("Form mapping failed", cfg.formId, e);
      mappings.set(cfg.formId, buildMapping([]));
    }

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
        const map = mappings.get(ref.cfg.formId) || buildMapping([]);
        const rows = expandSubmission(sub, ref.cfg, ref.timestamp, map);
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

function expandSubmission(
  sub: any,
  cfg: SchoolFormCfg,
  listTimestamp: string | undefined,
  map: FormMapping,
): StudentRow[] {
  const data = sub?.data ?? [];
  const parentName = parseNameField(pickValue(data, map.parentName));
  const parentAddress = parseAddressField(pickValue(data, map.parentAddress));
  const parentPhone = pickValue(data, map.parentPhone);
  const parentEmail = pickValue(data, map.parentEmail);
  const stop1 = parseAddressField(map.stops[0] ? pickValue(data, map.stops[0]) : "");
  const stop2 = parseAddressField(map.stops[1] ? pickValue(data, map.stops[1]) : "");
  const countRaw = pickValue(data, map.studentCount);
  const parsedCount = parseInt(countRaw, 10);

  const studentDefs = [...map.students];
  const cap = Math.max(1, studentDefs.length || 1);
  const count = parsedCount > 0 ? Math.min(parsedCount, cap) : cap;

  const students: { name: string; grade: string }[] = [];
  for (let i = 0; i < count; i++) {
    const def = studentDefs[i];
    if (!def) break;
    const name = parseNameField(pickValue(data, def.name));
    const grade = pickValue(data, def.grade);
    if (name || grade) students.push({ name: name || "(Unnamed student)", grade });
  }
  if (students.length === 0) {
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
    paymentStatus: "Pending" as const,
    submissionDate: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    checkNumber: "",
  }));
}
