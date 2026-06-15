import type { StudentRow } from "./types";

export interface DuplicateGroup {
  id: string;
  reason: string;
  rows: StudentRow[];
}

const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

export function detectDuplicates(rows: StudentRow[]): { rows: StudentRow[]; groups: DuplicateGroup[] } {
  const byNameAddr = new Map<string, StudentRow[]>();
  const byCheck = new Map<string, StudentRow[]>();
  for (const r of rows) {
    const k1 = `${norm(r.studentName)}|${norm(r.parentAddress)}`;
    if (norm(r.studentName) && norm(r.parentAddress)) {
      if (!byNameAddr.has(k1)) byNameAddr.set(k1, []);
      byNameAddr.get(k1)!.push(r);
    }
    if (r.checkNumber) {
      const k2 = norm(r.checkNumber);
      if (!byCheck.has(k2)) byCheck.set(k2, []);
      byCheck.get(k2)!.push(r);
    }
  }
  const groups: DuplicateGroup[] = [];
  let gid = 0;
  const flag = new Map<string, string>();
  const addGroup = (reason: string, list: StudentRow[]) => {
    if (list.length < 2) return;
    const id = `dup-${gid++}`;
    groups.push({ id, reason, rows: list });
    for (const r of list) flag.set(r.id, id);
  };
  for (const [, list] of byNameAddr) addGroup("Same student & address", list);
  for (const [, list] of byCheck) addGroup("Same check number", list);

  const out = rows.map((r) => ({
    ...r,
    duplicateFlag: flag.has(r.id),
    duplicateGroupId: flag.get(r.id),
  }));
  return { rows: out, groups };
}
