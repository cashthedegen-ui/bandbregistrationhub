import type { AppSettings, ArchivedSeason, StudentRow, SyncEvent } from "./types";

export const DEFAULT_FORMS = [
  { id: "f-hopkins", label: "Hopkins School Bus 26-27", formId: "6500704" },
  { id: "f-hopkins-shoreline", label: "Hopkins Shoreline", formId: "6499950" },
  { id: "f-foote-shoreline", label: "Foote Shoreline", formId: "6515338" },
  { id: "f-foote-wall", label: "Foote Wallingford/North Haven", formId: "6515339" },
  { id: "f-foote-woodbridge", label: "Foote Woodbridge", formId: "6515340" },
  { id: "f-king", label: "King School", formId: "6482769" },
  { id: "f-nd-prep", label: "Notre Dame Prep", formId: "6181520" },
  { id: "f-nd-prep-train", label: "Notre Dame Prep Train Shuttle", formId: "6181571" },
  { id: "f-st-lukes", label: "St Lukes Enrollment", formId: "6503621" },
];

export const DEFAULT_SETTINGS: AppSettings = {
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

export function mergeFormsWithDefaults(stored: AppSettings["forms"] | undefined | null): AppSettings["forms"] {
  const list = Array.isArray(stored) ? stored.map((f) => ({ ...f })) : [];
  const haveIds = new Set(list.map((f) => (f.formId || "").trim()).filter(Boolean));
  for (const d of DEFAULT_FORMS) {
    if (!haveIds.has(d.formId)) list.push({ ...d });
  }
  return list;
}

// All persistence now lives in Supabase. These helpers are kept ONLY as
// no-op shims so existing call sites continue to compile. They never read
// or write localStorage — that was the source of the payment-data wipe.
const noop = () => {};
export const storage = {
  getSettings: (): AppSettings => ({
    ...DEFAULT_SETTINGS,
    forms: mergeFormsWithDefaults(DEFAULT_SETTINGS.forms),
    receipt: { ...DEFAULT_SETTINGS.receipt },
  }),
  setSettings: noop as (s: AppSettings) => void,
  getStudents: (): StudentRow[] => [],
  setStudents: noop as (s: StudentRow[]) => void,
  getArchives: (): ArchivedSeason[] => [],
  setArchives: noop as (a: ArchivedSeason[]) => void,
  getMaster: (): StudentRow[] => [],
  setMaster: noop as (s: StudentRow[]) => void,
  getLastSync: (): string | null => null,
  setLastSync: noop as (d: string) => void,
  getStopCapacities: (): Record<string, number> => ({}),
  setStopCapacities: noop as (m: Record<string, number>) => void,
  getSyncHistory: (): SyncEvent[] => [],
  setSyncHistory: noop as (h: SyncEvent[]) => void,
  getDeletedSubmissions: (): string[] => [],
  setDeletedSubmissions: noop as (ids: string[]) => void,
};

export const stopKey = (schoolName: string, stopAddress: string) =>
  `${(schoolName || "").trim()}||${(stopAddress || "").trim()}`;
