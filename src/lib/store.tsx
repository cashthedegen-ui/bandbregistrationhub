import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage, stopKey } from "./storage";
import type { AppSettings, ArchivedSeason, StudentRow, SyncEvent } from "./types";
import { buildDemoStudents } from "./demo-data";
import { detectDuplicates, type DuplicateGroup } from "./duplicates";
import { fetchAllSubmissions } from "./formstack";
import { loadShared, saveShared, subscribeShared } from "./shared-state";
import { toast } from "sonner";

interface Activity { id: string; ts: string; text: string; }

const ensureDefaults = (r: StudentRow): StudentRow => {
  const paymentType = r.paymentType || (r.paid ? "Self Pay" : "Unpaid");
  // Migrate legacy "Exported" status to "Reviewed"
  const status = ((r.status as string) === "Exported" ? "Reviewed" : r.status) as StudentRow["status"];
  return {
    ...r,
    status,
    paymentStatus: r.paymentStatus || "Pending",
    notes: r.notes || "",
    paymentType,
    paid: paymentType !== "Unpaid",
    amountPaid: r.amountPaid ?? 0,
    rtAmount: r.rtAmount ?? 0,
    owAmount: r.owAmount ?? 0,
    financialAidNotes: r.financialAidNotes || "",
    familyPaid: r.familyPaid ?? 0,
    schoolOwes: r.schoolOwes ?? 0,
    schoolPaidReceived: r.schoolPaidReceived ?? false,
    schoolPaidAmount: r.schoolPaidAmount ?? 0,
  };
};


interface Ctx {
  ready: boolean;
  settings: AppSettings;
  students: StudentRow[];
  archives: ArchivedSeason[];
  dupGroups: DuplicateGroup[];
  lastSync: string | null;
  syncing: boolean;
  syncProgress: { done: number; total: number; label: string };
  isDemo: boolean;
  activity: Activity[];
  stopCapacities: Record<string, number>;
  syncHistory: SyncEvent[];
  updateSettings: (s: AppSettings) => void;
  updateStudent: (id: string, patch: Partial<StudentRow>) => void;
  deleteStudent: (id: string) => void;
  setStudents: (rows: StudentRow[]) => void;
  syncAll: () => Promise<void>;
  archiveSeason: (label: string) => void;
  restoreSeason: (id: string) => void;
  deleteArchive: (id: string) => void;
  loadDemo: () => void;
  setStopCapacity: (schoolName: string, stopAddress: string, capacity: number) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());
  const [students, setStudentsState] = useState<StudentRow[]>([]);
  const [archives, setArchives] = useState<ArchivedSeason[]>([]);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0, label: "" });
  const [isDemo, setIsDemo] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [stopCapacities, setStopCapacities] = useState<Record<string, number>>({});
  const [syncHistory, setSyncHistory] = useState<SyncEvent[]>([]);


  // hydrate on mount — pull shared state from Supabase first, fall back to local cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localSettings = storage.getSettings();
      if (!cancelled) setSettings(localSettings);

      const [remoteStudents, remoteArchives, remoteCaps, remoteHistory, remoteLastSync, remoteSettings] = await Promise.all([
        loadShared<StudentRow[]>("students", []),
        loadShared<ArchivedSeason[]>("archives", []),
        loadShared<Record<string, number>>("stopCapacities", {}),
        loadShared<SyncEvent[]>("syncHistory", []),
        loadShared<string | null>("lastSync", null),
        loadShared<Partial<AppSettings> | null>("settings", null),
      ]);
      if (cancelled) return;

      const studentsSrc = remoteStudents.length > 0 ? remoteStudents : storage.getStudents();
      if (studentsSrc.length > 0) {
        const { rows, groups } = detectDuplicates(studentsSrc.map(ensureDefaults));
        setStudentsState(rows);
        setDupGroups(groups);
        storage.setStudents(rows);
      }
      const archivesSrc = remoteArchives.length > 0 ? remoteArchives : storage.getArchives();
      setArchives(archivesSrc);
      storage.setArchives(archivesSrc);

      const capsSrc = Object.keys(remoteCaps).length > 0 ? remoteCaps : storage.getStopCapacities();
      setStopCapacities(capsSrc);
      storage.setStopCapacities(capsSrc);

      const historySrc = remoteHistory.length > 0 ? remoteHistory : storage.getSyncHistory();
      setSyncHistory(historySrc);
      storage.setSyncHistory(historySrc);

      const lastSyncSrc = remoteLastSync ?? storage.getLastSync();
      setLastSync(lastSyncSrc);
      if (lastSyncSrc) storage.setLastSync(lastSyncSrc);

      if (remoteSettings) {
        const merged: AppSettings = {
          ...localSettings,
          ...remoteSettings,
          apiToken: "",
          forms: remoteSettings.forms && remoteSettings.forms.length ? remoteSettings.forms : localSettings.forms,
          receipt: { ...localSettings.receipt, ...(remoteSettings.receipt || {}) },
        };
        setSettings(merged);
        storage.setSettings(merged);
      }

      setReady(true);
    })();

    // Realtime: react to changes pushed by other users
    const unsub = subscribeShared((key, value) => {
      if (key === "students") {
        const rows = (value as StudentRow[] | undefined) ?? [];
        const { rows: flagged, groups } = detectDuplicates(rows.map(ensureDefaults));
        setStudentsState(flagged);
        setDupGroups(groups);
        storage.setStudents(flagged);
      } else if (key === "archives") {
        const a = (value as ArchivedSeason[] | undefined) ?? [];
        setArchives(a);
        storage.setArchives(a);
      } else if (key === "stopCapacities") {
        const c = (value as Record<string, number> | undefined) ?? {};
        setStopCapacities(c);
        storage.setStopCapacities(c);
      } else if (key === "syncHistory") {
        const h = (value as SyncEvent[] | undefined) ?? [];
        setSyncHistory(h);
        storage.setSyncHistory(h);
      } else if (key === "lastSync") {
        const ls = (value as string | null | undefined) ?? null;
        setLastSync(ls);
        if (ls) storage.setLastSync(ls);
      } else if (key === "settings") {
        const rs = value as Partial<AppSettings> | undefined;
        if (rs) {
          setSettings((prev) => {
            const merged: AppSettings = {
              ...prev,
              ...rs,
              apiToken: "",
              forms: rs.forms && rs.forms.length ? rs.forms : prev.forms,
              receipt: { ...prev.receipt, ...(rs.receipt || {}) },
            };
            storage.setSettings(merged);
            return merged;
          });
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);


  const pushActivity = useCallback((text: string) => {
    setActivity((prev) => [{ id: `${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), text }, ...prev].slice(0, 30));
  }, []);

  const persistStudents = useCallback((rows: StudentRow[]) => {
    const { rows: flagged, groups } = detectDuplicates(rows);
    setStudentsState(flagged);
    setDupGroups(groups);
    storage.setStudents(flagged);
    void saveShared("students", flagged);
  }, []);

  const setStudents = useCallback((rows: StudentRow[]) => {
    setIsDemo(false);
    persistStudents(rows);
  }, [persistStudents]);

  const updateStudent = useCallback((id: string, patch: Partial<StudentRow>) => {
    setStudentsState((prev) => {
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch } as StudentRow;
        if (patch.paymentType !== undefined) {
          merged.paid = patch.paymentType !== "Unpaid";
          if (patch.paymentType === "Unpaid") merged.amountPaid = 0;
        }
        return merged;
      });
      storage.setStudents(next);
      void saveShared("students", next);
      return next;
    });
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setStudentsState((prev) => {
      const target = prev.find((r) => r.id === id);
      const next = prev.filter((r) => r.id !== id);
      storage.setStudents(next);
      void saveShared("students", next);
      if (target?.submissionId) {
        const deleted = storage.getDeletedSubmissions();
        if (!deleted.includes(target.submissionId)) {
          const nextDeleted = [...deleted, target.submissionId];
          storage.setDeletedSubmissions(nextDeleted);
          void saveShared("deletedSubmissions", nextDeleted);
        }
      }
      return next;
    });
  }, []);

  const updateSettings = useCallback((s: AppSettings) => {
    setSettings(s);
    storage.setSettings(s);
    void saveShared("settings", { ...s, apiToken: "" });
  }, []);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    setSyncProgress({ done: 0, total: 0, label: "Discovering forms…" });
    try {
      // Use configured forms; skip entries with no formId.
      const cfgs = settings.forms
        .filter((f) => f.formId.trim())
        .map((f) => ({ schoolLabel: f.label || `Form ${f.formId}`, formId: f.formId.trim() }));
      if (cfgs.length === 0) {
        toast.error("Add at least one Form ID in Settings.");
        setSyncing(false);
        return;
      }
      setSyncProgress({ done: 0, total: cfgs.length, label: "Fetching submissions…" });
      const rows = await fetchAllSubmissions(cfgs, "", (done, total, label) => {
        setSyncProgress({ done, total, label });
      });
      if (rows.length === 0) {
        toast.warning("No submissions returned. Check your token / form IDs.");
      } else {
        const deletedSubs = new Set(storage.getDeletedSubmissions());
        const filteredRows = rows.filter((r) => !r.submissionId || !deletedSubs.has(r.submissionId));
        const skippedDeleted = rows.length - filteredRows.length;
        const dedupeKey = (r: StudentRow) =>
          `${(r.studentName || "").toLowerCase().trim()}|${(r.parentEmail || "").toLowerCase().trim()}`;
        const existing = isDemo ? [] : students;
        const existingKeys = new Set(existing.map(dedupeKey));
        const existingSubIds = new Set(existing.map((r) => r.submissionId).filter(Boolean) as string[]);
        let added = 0;
        let skippedExisting = 0;
        const toAppend: StudentRow[] = [];
        for (const incoming of filteredRows) {
          const key = dedupeKey(incoming);
          if (existingKeys.has(key) || (incoming.submissionId && existingSubIds.has(incoming.submissionId))) {
            skippedExisting++;
            continue;
          }
          existingKeys.add(key);
          if (incoming.submissionId) existingSubIds.add(incoming.submissionId);
          toAppend.push(incoming);
          added++;
        }
        const merged = [...existing, ...toAppend];
        persistStudents(merged);
        setIsDemo(false);
        const now = new Date().toISOString();
        setLastSync(now);
        storage.setLastSync(now);
        void saveShared("lastSync", now);
        const evt: SyncEvent = { id: `sync-${Date.now()}`, ts: now, total: rows.length, added, updated: skippedExisting };
        setSyncHistory((prev) => {
          const next = [evt, ...prev].slice(0, 20);
          storage.setSyncHistory(next);
          void saveShared("syncHistory", next);
          return next;
        });
        pushActivity(`Synced ${rows.length} submissions: ${added} new, ${skippedExisting} already existed${skippedDeleted ? `, ${skippedDeleted} previously deleted` : ""}`);
        toast.success(`${added} new added${skippedDeleted ? ` · ${skippedDeleted} skipped (deleted)` : ""}`);
      }
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  }, [settings, students, isDemo, persistStudents, pushActivity]);

  const archiveSeason = useCallback((label: string) => {
    const a: ArchivedSeason = {
      id: `arc-${Date.now()}`,
      label,
      createdAt: new Date().toISOString(),
      students,
    };
    const next = [a, ...archives];
    setArchives(next);
    storage.setArchives(next);
    void saveShared("archives", next);
    pushActivity(`Archived season "${label}" with ${students.length} students`);
    toast.success(`Archived "${label}"`);
  }, [students, archives, pushActivity]);

  const restoreSeason = useCallback((id: string) => {
    const a = archives.find((x) => x.id === id);
    if (!a) return;
    persistStudents(a.students);
    toast.success(`Restored "${a.label}"`);
  }, [archives, persistStudents]);

  const deleteArchive = useCallback((id: string) => {
    const next = archives.filter((a) => a.id !== id);
    setArchives(next);
    storage.setArchives(next);
    void saveShared("archives", next);
  }, [archives]);

  const loadDemo = useCallback(() => {
    const demo = buildDemoStudents();
    persistStudents(demo);
    setIsDemo(true);
    toast.info("Demo data loaded");
  }, [persistStudents]);

  const setStopCapacity = useCallback((schoolName: string, stopAddress: string, capacity: number) => {
    setStopCapacities((prev) => {
      const k = stopKey(schoolName, stopAddress);
      const next = { ...prev };
      if (!capacity || capacity <= 0) delete next[k]; else next[k] = capacity;
      storage.setStopCapacities(next);
      void saveShared("stopCapacities", next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity,
    stopCapacities, syncHistory,
    updateSettings, updateStudent, deleteStudent, setStudents, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo,
    setStopCapacity,
  }), [ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity, stopCapacities, syncHistory, updateSettings, updateStudent, deleteStudent, setStudents, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo, setStopCapacity]);


  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
