import type { AppSettings, ArchivedSeason, StudentRow, SyncEvent } from "./types";

const KEYS = {
  settings: "bbt:settings",
  students: "bbt:students",
  archives: "bbt:archives",
  master: "bbt:master",
  lastSync: "bbt:lastSync",
  stopCaps: "bbt:stopCapacities",
  syncHistory: "bbt:syncHistory",
  deletedSubs: "bbt:deletedSubmissions",
};

export const DEFAULT_FORMS = [
  { id: "f-hopkins",           label: "Hopkins School Bus 26-27",      formId: "6500704" },
  { id: "f-hopkins-shoreline", label: "Hopkins Shoreline",             formId: "6499950" },
  { id: "f-foote-shoreline",   label: "Foote Shoreline",               formId: "6515338" },
  { id: "f-foote-wall",        label: "Foote Wallingford/North Haven", formId: "6515339" },
  { id: "f-foote-woodbridge",  label: "Foote Woodbridge",              formId: "6515340" },
  { id: "f-king",              label: "King School",                   formId: "6482769" },
  { id: "f-nd-prep",           label: "Notre Dame Prep",               formId: "6181520" },
  { id: "f-nd-prep-train",     label: "Notre Dame Prep Train Shuttle", formId: "6181571" },
  { id: "f-st-lukes",          label: "St Lukes Enrollment",           formId: "6503621" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  // API token is stored server-side as a Supabase secret (FORMSTACK_API_TOKEN)
  // and accessed via the formstack-proxy edge function. Kept here as an empty
  // string for backwards compatibility with existing settings shape.
  apiToken: "",
  forms: DEFAULT_FORMS.map((f) => ({ ...f })),
  receipt: {
    companyName: "B & B Transit",
    companyAddress: "Connecticut",
    companyPhone: "(203) 555-0100",
    companyEmail: "ops@bbtransit.com",
    schoolYear: "2026 – 2027",
    footer: "Thank you for riding with B & B Transit.",
  },
};

/**
 * Merge a stored forms list with DEFAULT_FORMS so any default form missing
 * from local/remote storage (e.g. older installs that only had Hopkins) is
 * auto-added. Preserves user edits for forms already present by formId and
 * keeps any custom forms the user added.
 */
export function mergeFormsWithDefaults(
  stored: AppSettings["forms"] | undefined | null
): AppSettings["forms"] {
  const list = Array.isArray(stored) ? stored.map((f) => ({ ...f })) : [];
  const haveIds = new Set(list.map((f) => (f.formId || "").trim()).filter(Boolean));
  for (const d of DEFAULT_FORMS) {
    if (!haveIds.has(d.formId)) list.push({ ...d });
  }
  return list;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const storage = {
  getSettings: (): AppSettings => {
    const s = read<Partial<AppSettings>>(KEYS.settings, {});
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      // Always clear any locally-cached API token; the secret lives server-side.
      apiToken: "",
      forms: (s.forms && s.forms.length ? s.forms : DEFAULT_SETTINGS.forms),
      receipt: { ...DEFAULT_SETTINGS.receipt, ...(s.receipt || {}) },
    };
  },
  setSettings: (s: AppSettings) => write(KEYS.settings, { ...s, apiToken: "" }),
  getStudents: (): StudentRow[] => read<StudentRow[]>(KEYS.students, []),
  setStudents: (s: StudentRow[]) => write(KEYS.students, s),
  getArchives: (): ArchivedSeason[] => read<ArchivedSeason[]>(KEYS.archives, []),
  setArchives: (a: ArchivedSeason[]) => write(KEYS.archives, a),
  getMaster: (): StudentRow[] => read<StudentRow[]>(KEYS.master, []),
  setMaster: (s: StudentRow[]) => write(KEYS.master, s),
  getLastSync: (): string | null => read<string | null>(KEYS.lastSync, null),
  setLastSync: (d: string) => write(KEYS.lastSync, d),
  getStopCapacities: (): Record<string, number> => read<Record<string, number>>(KEYS.stopCaps, {}),
  setStopCapacities: (m: Record<string, number>) => write(KEYS.stopCaps, m),
  getSyncHistory: (): SyncEvent[] => read<SyncEvent[]>(KEYS.syncHistory, []),
  setSyncHistory: (h: SyncEvent[]) => write(KEYS.syncHistory, h),
  getDeletedSubmissions: (): string[] => read<string[]>(KEYS.deletedSubs, []),
  setDeletedSubmissions: (ids: string[]) => write(KEYS.deletedSubs, ids),
};

export const stopKey = (schoolName: string, stopAddress: string) =>
  `${(schoolName || "").trim()}||${(stopAddress || "").trim()}`;

