import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "./storage";
import type { AppSettings, ArchivedSeason, StudentRow } from "./types";
import { buildDemoStudents } from "./demo-data";
import { detectDuplicates, type DuplicateGroup } from "./duplicates";
import { fetchAllSubmissions } from "./formstack";
import { toast } from "sonner";

interface Activity { id: string; ts: string; text: string; }

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
  updateSettings: (s: AppSettings) => void;
  updateStudent: (id: string, patch: Partial<StudentRow>) => void;
  setStudents: (rows: StudentRow[]) => void;
  syncAll: () => Promise<void>;
  archiveSeason: (label: string) => void;
  restoreSeason: (id: string) => void;
  deleteArchive: (id: string) => void;
  loadDemo: () => void;
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

  // hydrate on mount (client-only)
  useEffect(() => {
    const s = storage.getSettings();
    setSettings(s);
    const stored = storage.getStudents();
    if (stored.length === 0) {
      const demo = buildDemoStudents();
      const { rows, groups } = detectDuplicates(demo);
      setStudentsState(rows);
      setDupGroups(groups);
      setIsDemo(true);
    } else {
      const { rows, groups } = detectDuplicates(stored);
      setStudentsState(rows);
      setDupGroups(groups);
    }
    setArchives(storage.getArchives());
    setLastSync(storage.getLastSync());
    setReady(true);
  }, []);

  const pushActivity = useCallback((text: string) => {
    setActivity((prev) => [{ id: `${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), text }, ...prev].slice(0, 30));
  }, []);

  const persistStudents = useCallback((rows: StudentRow[]) => {
    const { rows: flagged, groups } = detectDuplicates(rows);
    setStudentsState(flagged);
    setDupGroups(groups);
    storage.setStudents(flagged);
  }, []);

  const setStudents = useCallback((rows: StudentRow[]) => {
    setIsDemo(false);
    persistStudents(rows);
  }, [persistStudents]);

  const updateStudent = useCallback((id: string, patch: Partial<StudentRow>) => {
    setStudentsState((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      storage.setStudents(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((s: AppSettings) => {
    setSettings(s);
    storage.setSettings(s);
  }, []);

  const syncAll = useCallback(async () => {
    if (!settings.apiToken) {
      toast.error("Add your Formstack API token in Settings.");
      return;
    }
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
      const rows = await fetchAllSubmissions(cfgs, settings.apiToken, (done, total, label) => {
        setSyncProgress({ done, total, label });
      });
      if (rows.length === 0) {
        toast.warning("No submissions returned. Check your token / form IDs.");
      } else {
        persistStudents(rows);
        setIsDemo(false);
        const now = new Date().toISOString();
        setLastSync(now);
        storage.setLastSync(now);
        pushActivity(`Synced ${rows.length} students from ${cfgs.filter((c) => c.formId).length} forms`);
        toast.success(`Synced ${rows.length} students`);
      }
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  }, [settings, persistStudents, pushActivity]);

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
  }, [archives]);

  const loadDemo = useCallback(() => {
    const demo = buildDemoStudents();
    persistStudents(demo);
    setIsDemo(true);
    toast.info("Demo data loaded");
  }, [persistStudents]);

  const value = useMemo<Ctx>(() => ({
    ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity,
    updateSettings, updateStudent, setStudents, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo,
  }), [ready, settings, students, archives, dupGroups, lastSync, syncing, syncProgress, isDemo, activity, updateSettings, updateStudent, setStudents, syncAll, archiveSeason, restoreSeason, deleteArchive, loadDemo]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
