import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage, stopKey, mergeFormsWithDefaults, DEFAULT_SETTINGS } from "./storage";
import type { AppSettings, ArchivedSeason, StudentRow, SyncEvent } from "./types";
import { buildDemoStudents } from "./demo-data";
import { detectDuplicates, type DuplicateGroup } from "./duplicates";
import { fetchAllSubmissions } from "./formstack";
import { loadShared, saveShared, subscribeShared } from "./shared-state";
import { fetchAllStudents, upsertStudent, upsertStudents, deleteStudentRow, deleteAllStudents, subscribeStudents } from "./students-repo";
import { useAuth } from "./auth";
import { logAudit } from "./audit-log";
import { toast } from "sonner";

interface Activity { id: string; ts: string; text: string; }

const ensureDefaults = (r: StudentRow): StudentRow => {
  const paymentType = r.paymentType || (r.paid ? "Self Pay" : "Unpaid");
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
  const { user, loading: authLoading } = useAuth();
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
  const [deletedSubs, setDeletedSubs] = useState<string[]>([]);

  const applyStudents = useCallback((rows: StudentRow[]) => {
    const { rows: flagged, groups } = detectDuplicates(rows.map(ensureDefaults));
    setStudentsState(flagged);
    setDupGroups(groups);
    storage.setStudents(flagged);
    return flagged;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStudentsState([]);
      setDupGroups([]);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const [remoteStudents, remoteArchives, remoteCaps, remoteHistory, remoteLastSync, remoteSettings, remoteDeleted] = await Promise.all([
          fetchAllStudents(),
          loadShared<ArchivedSeason[]>("archives", []),
          loadShared<Record<string, number>>("stopCapacities", {}),
          loadShared<SyncEvent[]>("syncHistory", []),
          loadShared<string | null>("lastSync", null),
          loadShared<Partial<AppSettings> | null>("settings", null),
          loadShared<string[]>("deletedSubmissions", []),
        ]);
        if (cancelled) return;

        applyStudents(remoteStudents);
        setArchives(remoteArchives);
        setStopCapacities(remoteCaps);
        setSyncHistory(remoteHistory);
        setLastSync(remoteLastSync);
        setDeletedSubs(remoteDeleted);

        const base = remoteSettings ?? {};
        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...base,
          apiToken: "",
          forms: mergeFormsWithDefaults(base.forms && base.forms.length ? base.forms : undefined),
          receipt: { ...DEFAULT_SETTINGS.receipt, ...(base.receipt || {}) },
        };
        setSettings(merged);
      } catch (e) {
        console.error("[store] cloud load failed", e);
        toast.error("Couldn't load data from the cloud. Check your connection and refresh.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    const unsubStudents = subscribeStudents({
      onUpsert: (row) => {
        setStudentsState((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          const next = idx >= 0 ? prev.map((r, i) => (i === idx ? ensureDefaults(row) : r)) : [...prev, ensureDefaults(row)];
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

    const unsubShared = subscribeShared((key, value) => {
      if (key === "archives") {
        setArchives((value as ArchivedSeason[] | undefined) ?? []);
      } else if (key === "stopCapacities") {
        setStopCapacities((value as Record<string, number> | undefined) ?? {});
      } else if (key === "syncHistory") {
        setSyncHistory((value as SyncEvent[] | undefined) ?? []);
      } else if (key === "lastSync") {
        setLastSync((value as string | null | undefined) ?? null);
      } else if (key === "deletedSubmissions") {
        setDeletedSubs((value as string[] | undefined) ?? []);
      } else if (key === "settings") {
        const rs = value as Partial<AppSettings> | undefined;
        if (rs) {
          setSettings((prev) => ({
            ...prev,
            ...rs,
            apiToken: "",
            forms: mergeFormsWithDefaults(rs.forms && rs.forms.length ? rs.forms : prev.forms),
            receipt: { ...prev.receipt, ...(rs.receipt || {}) },
          }));
        }
      }
    });

    return () => {
      cancelled = true;
      unsubStudents();
      unsubShared();
    };
  }, [authLoading, user, applyStudents]);

  const pushActivity = useCallback((text: string) => {
    setActivity((prev) => [{ id: `${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), text }, ...prev].slice(0, 30));
  }, []);

  const updateStudent = useCallback((id: string, patch: Partial<StudentRow>) => {
    setStudentsState((prev) => {
      let updated: StudentRow | null = null;
      let prevRow: StudentRow | null = null;
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        prevRow = r;
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
        const u = updated as StudentRow;
        const p = prevRow as StudentRow | null;
        upsertStudent(u).catch((e) => {
          console.error("[store] save student failed", e);
          toast.error("Failed to save change. Check your connection.");
        });
        // Build a human summary of what changed for the audit log
        const fieldLabels: Record<string, string> = {
          status: "status", paymentStatus: "payment status", paymentType: "payment type",
          amountPaid: "amount paid", rtAmount: "RT amount", owAmount: "OW amount",
          familyPaid: "family paid", schoolOwes: "school owes",
          schoolPaidReceived: "school paid received", schoolPaidAmount: "school paid amount",
          checkNumber: "check #", notes: "notes", financialAidNotes: "aid notes",
          stopAddress: "stop", stopAddress2: "stop 2",
          parentName: "parent name", parentPhone: "parent phone", parentEmail: "parent email",
          parentAddress: "parent address", studentName: "student name",
          grade: "grade", schoolName: "school",
        };
        const changes: string[] = [];
        const details: Record<string, unknown> = {};
        for (const k of Object.keys(patch) as (keyof StudentRow)[]) {
          const label = fieldLabels[k as string] ?? (k as string);
          const before = p ? (p as any)[k] : undefined;
          const after = (u as any)[k];
          if (before === after) continue;
          details[k as string] = { before, after };
          if (k === "status") changes.push(`marked as ${String(after)}`);
          else changes.push(`${label} → ${after === "" || after == null ? "(empty)" : String(after)}`);
        }
        if (changes.length > 0) {
          void logAudit({
            action: changes.join(", "),
            entityType: "student",
            entityId: u.id,
            entityName: u.studentName,
            details,
          });
        }
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
      if (target) {
        void logAudit({
          action: "deleted student",
          entityType: "student",
          entityId: target.id,
          entityName: target.studentName,
          details: { school: target.schoolName, submissionId: target.submissionId },
        });
      }
      if (target?.submissionId) {
        if (!deletedSubs.includes(target.submissionId)) {
          const nextDeleted = [...deletedSubs, target.submissionId];
          setDeletedSubs(nextDeleted);
          void saveShared("deletedSubmissions", nextDeleted);
        }
      }
      return next;
    });
  }, [deletedSubs]);

  const updateSettings = useCallback((s: AppSettings) => {
    setSettings(s);
    storage.setSettings(s);
    void saveShared("settings", { ...s, apiToken: "" });
    void logAudit({
      action: "updated settings",
      entityType: "settings",
      entityName: `${s.forms.length} forms configured`,
    });
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
      const rows = await fetchAllSubmissions(cfgs, "", (done, total, label) => setSyncProgress({ done, total, label }));
      if (rows.length === 0) {
        toast.warning("No submissions returned. Check your form IDs.");
      } else {
        const deletedSet = new Set(deletedSubs);
        const filteredRows = rows.filter((r) => !r.submissionId || !deletedSet.has(r.submissionId));
        const skippedDeleted = rows.length - filteredRows.length;
        // Dedupe by (name+email) primarily. submissionId can be shared by
        // multiple sibling students from the same form submission, so we only
        // use it to skip rows that already existed in the DB before this sync —
        // never to skip siblings encountered within this same sync.
        const dedupeKey = (r: StudentRow) => `${(r.studentName || "").toLowerCase().trim()}|${(r.parentEmail || "").toLowerCase().trim()}`;
        const existing = isDemo ? [] : students;
        const existingKeys = new Set(existing.map(dedupeKey));
        const existingById = new Map(existing.map((r) => [r.id, r] as const));
        const isUnnamed = (n: string | undefined) => {
          const s = (n || "").trim().toLowerCase();
          return !s || s === "(unnamed student)" || s === "(unknown student)";
        };
        let added = 0;
        let updated = 0;
        let skippedExisting = 0;
        const toAppend: StudentRow[] = [];
        const updates = new Map<string, StudentRow>();
        for (const incoming of filteredRows) {
          const prior = existingById.get(incoming.id);
          // Reprocess: if we already have this exact row (same submissionId+index)
          // but its student name was never captured, update it in place with the
          // corrected mapping. Preserve all user-entered fields (payment, status,
          // notes, flags, etc.) — only refresh the fields sourced from Formstack.
          if (prior && isUnnamed(prior.studentName) && !isUnnamed(incoming.studentName)) {
            const merged: StudentRow = {
              ...prior,
              studentName: incoming.studentName,
              grade: incoming.grade || prior.grade,
              stopAddress: incoming.stopAddress || prior.stopAddress,
              stopAddress2: incoming.stopAddress2 || prior.stopAddress2,
              parentName: incoming.parentName || prior.parentName,
              parentPhone: incoming.parentPhone || prior.parentPhone,
              parentEmail: incoming.parentEmail || prior.parentEmail,
              parentAddress: incoming.parentAddress || prior.parentAddress,
            };
            updates.set(prior.id, merged);
            existingKeys.add(dedupeKey(merged));
            updated++;
            continue;
          }
          const key = dedupeKey(incoming);
          if (existingKeys.has(key)) {
            skippedExisting++;
            continue;
          }
          existingKeys.add(key);
          toAppend.push(incoming);
          added++;
        }
        const writeBatch = [...updates.values(), ...toAppend];
        if (writeBatch.length > 0) await upsertStudents(writeBatch);
        const nextExisting = existing.map((r) => updates.get(r.id) ?? r);
        applyStudents([...nextExisting, ...toAppend]);
        setIsDemo(false);
        const now = new Date().toISOString();
        setLastSync(now);
        storage.setLastSync(now);
        void saveShared("lastSync", now);
        const evt: SyncEvent = { id: `sync-${Date.now()}`, ts: now, total: rows.length, added, updated: skippedExisting + updated };
        setSyncHistory((prev) => {
          const next = [evt, ...prev].slice(0, 20);
          storage.setSyncHistory(next);
          void saveShared("syncHistory", next);
          return next;
        });
        pushActivity(`Synced ${rows.length} submissions: ${added} new, ${updated} updated, ${skippedExisting} already existed${skippedDeleted ? `, ${skippedDeleted} previously deleted` : ""}`);
        void logAudit({
          action: `synced ${rows.length} submissions (${added} new, ${skippedExisting} already existed)`,
          entityType: "sync",
          entityName: `${cfgs.length} form(s)`,
          details: { total: rows.length, added, skippedExisting, skippedDeleted },
        });
        toast.success(`${added} new added${skippedDeleted ? ` · ${skippedDeleted} skipped (deleted)` : ""}`);
      }
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  }, [settings, students, isDemo, deletedSubs, applyStudents, pushActivity]);

  const archiveSeason = useCallback((label: string) => {
    const a: ArchivedSeason = { id: `arc-${Date.now()}`, label, createdAt: new Date().toISOString(), students };
    const next = [a, ...archives];
    setArchives(next);
    storage.setArchives(next);
    void saveShared("archives", next);
    pushActivity(`Archived season "${label}" with ${students.length} students`);
    void logAudit({ action: `archived season "${label}"`, entityType: "archive", entityName: label, details: { count: students.length } });
    toast.success(`Archived "${label}"`);
  }, [students, archives, pushActivity]);

  const restoreSeason = useCallback((id: string) => {
    const a = archives.find((x) => x.id === id);
    if (!a) return;
    (async () => {
      try {
        await deleteAllStudents();
        await upsertStudents(a.students, { force: true });
        applyStudents(a.students);
        void logAudit({ action: `restored season "${a.label}"`, entityType: "archive", entityId: a.id, entityName: a.label, details: { count: a.students.length } });
        toast.success(`Restored "${a.label}"`);
      } catch (e) {
        console.error("[store] restore failed", e);
        toast.error("Restore failed. Try again.");
      }
    })();
  }, [archives, applyStudents]);

  const deleteArchive = useCallback((id: string) => {
    const target = archives.find((a) => a.id === id);
    const next = archives.filter((a) => a.id !== id);
    setArchives(next);
    storage.setArchives(next);
    void saveShared("archives", next);
    if (target) void logAudit({ action: `deleted archive "${target.label}"`, entityType: "archive", entityId: target.id, entityName: target.label });
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

  // One-shot auto re-sync after pagination fix — runs once per browser session
  // to backfill any students missed by the previous broken sync.
  useEffect(() => {
    if (!ready || !user || syncing) return;
    if (settings.forms.filter((f) => f.formId.trim()).length === 0) return;
    const FLAG = "autoResyncV2_done";
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1");
    } catch { return; }
    toast.info("Backfilling missing students from all forms…");
    void syncAll();
  }, [ready, user, settings.forms, syncing, syncAll]);

  const value = useMemo<Ctx>(() => ({
    ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity,
    stopCapacities, syncHistory,
    updateSettings, updateStudent, deleteStudent, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo, setStopCapacity,
  }), [ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity, stopCapacities, syncHistory, updateSettings, updateStudent, deleteStudent, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo, setStopCapacity]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
