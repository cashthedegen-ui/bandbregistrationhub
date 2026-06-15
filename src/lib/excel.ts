import * as XLSX from "xlsx";
import type { StudentRow } from "./types";
import { storage } from "./storage";

const HEADERS = [
  "Student Name", "Grade", "School", "Stop Address",
  "Parent Name", "Parent Phone", "Parent Email", "Parent Address",
  "Status", "Alert", "Notes", "Submission Date",
];

function toRow(r: StudentRow) {
  return [
    r.studentName, r.grade, r.schoolName, r.stopAddress,
    r.parentName, r.parentPhone, r.parentEmail, r.parentAddress,
    r.status, r.alertFlag ? "YES" : "", r.notes,
    new Date(r.submissionDate).toLocaleDateString(),
  ];
}

const dedupeKey = (r: StudentRow) =>
  `${r.studentName.toLowerCase().trim()}|${r.parentEmail.toLowerCase().trim()}|${r.schoolName.toLowerCase().trim()}`;

export function exportMaster(newRows: StudentRow[]) {
  const existing = storage.getMaster();
  const map = new Map<string, StudentRow>();
  for (const r of existing) map.set(dedupeKey(r), r);
  for (const r of newRows) map.set(dedupeKey(r), r); // newer overrides
  const merged = Array.from(map.values());
  storage.setMaster(merged);
  downloadWorkbook(merged, "BB_Transit_Master.xlsx");
}

export function exportRows(rows: StudentRow[], filename = "BB_Transit_Export.xlsx") {
  downloadWorkbook(rows, filename);
}

function downloadWorkbook(rows: StudentRow[], filename: string) {
  const wb = XLSX.utils.book_new();
  const sorted = [...rows].sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName) || a.studentName.localeCompare(b.studentName),
  );
  const allSheet = XLSX.utils.aoa_to_sheet([HEADERS, ...sorted.map(toRow)]);
  XLSX.utils.book_append_sheet(wb, allSheet, "All Students");
  const schools = Array.from(new Set(sorted.map((r) => r.schoolName))).filter(Boolean);
  for (const s of schools) {
    const subset = sorted.filter((r) => r.schoolName === s);
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...subset.map(toRow)]);
    const safeName = s.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31) || "School";
    XLSX.utils.book_append_sheet(wb, sheet, safeName);
  }
  XLSX.writeFile(wb, filename);
}

export function exportStudentsClean(rows: StudentRow[], filename = "BB_Transit_Students.xlsx") {
  const headers = ["#", "Student Name", "Grade", "School", "Bus Stop", "Parent Name", "Phone", "Email", "Address", "Status"];
  const data = rows.map((r, i) => [
    i + 1, r.studentName, r.grade, r.schoolName, r.stopAddress,
    r.parentName, r.parentPhone, r.parentEmail, r.parentAddress, r.status,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  sheet["!cols"] = [{ wch: 5 }, { wch: 24 }, { wch: 8 }, { wch: 22 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 32 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Students");
  XLSX.writeFile(wb, filename);
}

export function exportRoutesWorkbook(rows: StudentRow[]) {
  const wb = XLSX.utils.book_new();
  const byRoute = new Map<string, StudentRow[]>();
  for (const r of rows) {
    const k = r.schoolName || "Unassigned";
    if (!byRoute.has(k)) byRoute.set(k, []);
    byRoute.get(k)!.push(r);
  }
  for (const [route, list] of byRoute) {
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...list.map(toRow)]);
    XLSX.utils.book_append_sheet(wb, sheet, route.slice(0, 31));
  }
  XLSX.writeFile(wb, "BB_Transit_Routes.xlsx");
}
