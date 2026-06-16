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

export const DEFAULT_SETTINGS: AppSettings = {
  apiToken: "3984db4605cb5ca5892112044ee4080c",
  forms: [
    { id: "f-hopkins", label: "Hopkins School Bus 26-27", formId: "6500704" },
  ],
  receipt: {
    companyName: "B & B Transit",
    companyAddress: "Connecticut",
    companyPhone: "(203) 555-0100",
    companyEmail: "ops@bbtransit.com",
    schoolYear: "2026 – 2027",
    footer: "Thank you for riding with B & B Transit.",
  },
};

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
      forms: (s.forms && s.forms.length ? s.forms : DEFAULT_SETTINGS.forms),
      receipt: { ...DEFAULT_SETTINGS.receipt, ...(s.receipt || {}) },
    };
  },
  setSettings: (s: AppSettings) => write(KEYS.settings, s),
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

