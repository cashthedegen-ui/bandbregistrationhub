import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage, stopKey, mergeFormsWithDefaults } from "./storage";
import type { AppSettings, ArchivedSeason, StudentRow, SyncEvent } from "./types";
import { buildDemoStudents } from "./demo-data";
import { detectDuplicates, type DuplicateGroup } from "./duplicates";
import { fetchAllSubmissions } from "./formstack";
import { loadShared, saveShared, subscribeShared } from "./shared-state";
import {
  fetchAllStudents,
  upsertStudent,
  upsertStudents,
  deleteStudentRow,
  deleteAllStudents,
  subscribeStudents,
} from "./students-repo";
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

  // Recompute duplicate groups whenever the student list changes,
  // so per-row realtime updates keep duplicate flags fresh.
  const applyStudents = useCallback((rows: StudentRow[]) => {
    const { rows: flagged, groups } = detectDuplicates(rows.map(ensureDefaults));
    setStudentsState(flagged);
    setDupGroups(groups);
    storage.setStudents(flagged);
    return flagged;
  }, []);


  // hydrate on mount — pull from Supabase first, fall back to local cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localSettings = storage.getSettings();
      if (!cancelled) setSettings(localSettings);

      const [remoteArchives, remoteCaps, remoteHistory, remoteLastSync, remoteSettings] = await Promise.all([
        loadShared<ArchivedSeason[]>("archives", []),
        loadShared<Record<string, number>>("stopCapacities", {}),
        loadShared<SyncEvent[]>("syncHistory", []),
        loadShared<string | null>("lastSync", null),
        loadShared<Partial<AppSettings> | null>("settings", null),
      ]);
      if (cancelled) return;

      // Students: load from dedicated table (per-row), with local fallback while remote loads
      const cached = storage.getStudents();
      if (cached.length > 0) applyStudents(cached);

      try {
        const remoteStudents = await fetchAllStudents();
        if (cancelled) return;
        if (remoteStudents.length > 0) applyStudents(remoteStudents);
      } catch (e) {
        console.warn("[store] students load failed", e);
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

      {
        const base = remoteSettings ?? {};
        const merged: AppSettings = {
          ...localSettings,
          ...base,
          apiToken: "",
          forms: mergeFormsWithDefaults(
            (base.forms && base.forms.length ? base.forms : localSettings.forms)
          ),
          receipt: { ...localSettings.receipt, ...(base.receipt || {}) },
        };
        setSettings(merged);
        storage.setSettings(merged);
        const storedForms = remoteSettings?.forms ?? [];
        if (storedForms.length !== merged.forms.length) {
          void saveShared("settings", merged);
        }
      }

      setReady(true);
    })();

    // Realtime: per-row student changes
    const unsubStudents = subscribeStudents({
      onUpsert: (row) => {
        setStudentsState((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          const next = idx >= 0
            ? prev.map((r, i) => (i === idx ? ensureDefaults(row) : r))
            : [...prev, ensureDefaults(row)];
          const { rows: flagged, groups } = detectDuplicates(next);
          setDupGroups(groups);
          storage.setStudents(flagged);
          return flagged;
        });
      },
      onDelete: (id) => {
        setStudentsState((prev) => {
          const next = prev.filter((r) => r.id !== id);
          const { rows: flagged, groups } = detectDuplicates(next);
          setDupGroups(groups);
          storage.setStudents(flagged);
          return flagged;
        });
      },
    });

    // Realtime: other shared state (archives, settings, etc.)
    const unsubShared = subscribeShared((key, value) => {
      if (key === "archives") {
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
              forms: mergeFormsWithDefaults(rs.forms && rs.forms.length ? rs.forms : prev.forms),
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
      unsubStudents();
      unsubShared();
    };
  }, [applyStudents]);


  const pushActivity = useCallback((text: string) => {
    setActivity((prev) => [{ id: `${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), text }, ...prev].slice(0, 30));
  }, []);

  const updateStudent = useCallback((id: string, patch: Partial<StudentRow>) => {
    setStudentsState((prev) => {
      let updated: StudentRow | null = null;
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch } as StudentRow;
        if (patch.paymentType !== undefined) {
          merged.paid = patch.paymentType !== "Unpaid";
          if (patch.paymentType === "Unpaid") merged.amountPaid = 0;
        }
        updated = merged;
        return merged;
      });
      storage.setStudents(next);
      if (updated) {
        upsertStudent(updated).catch((e) => {
          console.error("[store] save student failed", e);
          toast.error("Failed to save change. Check your connection.");
        });
      }
      return next;
    });
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setStudentsState((prev) => {
      const target = prev.find((r) => r.id === id);
      const next = prev.filter((r) => r.id !== id);
      storage.setStudents(next);
      deleteStudentRow(id).catch((e) => {
        console.error("[store] delete student failed", e);
        toast.error("Failed to delete. Check your connection.");
      });
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
        // Only the new students get written — existing rows (with payment edits) are untouched.
        if (toAppend.length > 0) {
          try {
            await upsertStudents(toAppend);
          } catch (e) {
            console.error("[store] bulk insert failed", e);
            toast.error("Some new students failed to save. Try again.");
          }
        }
        const merged = [...existing, ...toAppend];
        applyStudents(merged);
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
  }, [settings, students, isDemo, applyStudents, pushActivity]);

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
    (async () => {
      try {
        await deleteAllStudents();
        await upsertStudents(a.students);
        applyStudents(a.students);
        toast.success(`Restored "${a.label}"`);
      } catch (e) {
        console.error("[store] restore failed", e);
        toast.error("Restore failed. Try again.");
      }
    })();
  }, [archives, applyStudents]);

  const deleteArchive = useCallback((id: string) => {
    const next = archives.filter((a) => a.id !== id);
    setArchives(next);
    storage.setArchives(next);
    void saveShared("archives", next);
  }, [archives]);

  const loadDemo = useCallback(() => {
    const demo = buildDemoStudents();
    applyStudents(demo);
    setIsDemo(true);
    toast.info("Demo data loaded (not saved to cloud)");
  }, [applyStudents]);

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
    updateSettings, updateStudent, deleteStudent, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo,
    setStopCapacity,
  }), [ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity, stopCapacities, syncHistory, updateSettings, updateStudent, deleteStudent, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo, setStopCapacity]);


  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
