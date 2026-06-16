import XLSX from "xlsx-js-style";
import type { StudentRow } from "./types";
import { storage } from "./storage";

// --- helpers -----------------------------------------------------------------

function splitName(full: string): [string, string] {
  const t = (full || "").trim();
  if (!t) return ["", ""];
  const parts = t.split(/\s+/);
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts.slice(1).join(" ")];
}

// Best-effort parse: "123 Main St, Apt 4, Springfield, MA 01103"
function parseAddress(input: string): {
  address: string; address2: string; city: string; state: string; zip: string;
} {
  const raw = (input || "").trim();
  if (!raw) return { address: "", address2: "", city: "", state: "", zip: "" };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);

  // Try to find "ST 12345" or "ST 12345-6789" at the end
  let state = "";
  let zip = "";
  if (parts.length) {
    const last = parts[parts.length - 1];
    const m = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      state = m[1].toUpperCase();
      zip = m[2];
      parts.pop();
    } else {
      const zm = last.match(/^(\d{5}(?:-\d{4})?)$/);
      if (zm) { zip = zm[1]; parts.pop(); }
      const sm = parts.length ? parts[parts.length - 1].match(/^([A-Za-z]{2})$/) : null;
      if (sm) { state = sm[1].toUpperCase(); parts.pop(); }
    }
  }
  const city = parts.length ? parts.pop()! : "";
  const address = parts.length ? parts.shift()! : "";
  const address2 = parts.join(", ");
  return { address, address2, city, state, zip };
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function serviceLabel(s: StudentRow): string {
  const rt = s.rtAmount ?? 0;
  const ow = s.owAmount ?? 0;
  if (rt && ow) return "RT + OW";
  if (rt) return "Round Trip";
  if (ow) return "One Way";
  return "";
}

// --- column layout -----------------------------------------------------------

const HEADERS = [
  "Time", "Parent First", "Parent Last", "Address", "Address 2", "City", "State", "Zip",
  "Phone", "Email", "Number of Students",
  "Student 1 (First)", "Student 1 (Last)", "26-27 Grade (Student 1)", "Choose Desired Service (Student 1)",
  "Student 2 (First)", "Student 2 (Last)", "26-27 Grade (Student 2)", "Choose Desired Service (Student 2)",
  "Student 3 (First)", "Student 3 (Last)", "26-27 Grade (Student 3)", "Choose Desired Service (Student 3)",
  "Please Select Desired Location",
  "RT", "OW", "Paid", "F/A",
];

const COL_WIDTHS = [
  18, 14, 14, 28, 14, 16, 8, 10, 14, 26, 10,
  14, 14, 12, 26,
  14, 14, 12, 26,
  14, 14, 12, 26,
  30,
  10, 10, 10, 10,
];

interface FamilyRow {
  time: string;
  parentFirst: string;
  parentLast: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  numStudents: number;
  students: StudentRow[]; // up to 3 used in columns
  location: string;
  rt: number;
  ow: number;
  paid: number;
  fa: number;
  flagged: boolean;
}

function buildFamilies(rows: StudentRow[]): FamilyRow[] {
  const groups = new Map<string, StudentRow[]>();
  for (const r of rows) {
    const k = r.submissionId || `${r.parentEmail}|${r.parentName}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: FamilyRow[] = [];
  for (const list of groups.values()) {
    const head = list[0];
    const [pf, pl] = splitName(head.parentName);
    const addr = parseAddress(head.parentAddress);
    let rt = 0, ow = 0, paid = 0, fa = 0;
    let flagged = false;
    for (const s of list) {
      rt += s.rtAmount ?? 0;
      ow += s.owAmount ?? 0;
      if ((s.paymentType || (s.paid ? "Self Pay" : "Unpaid")) === "Self Pay") {
        paid += s.amountPaid ?? ((s.rtAmount ?? 0) + (s.owAmount ?? 0));
      }
      if ((s.paymentType || "") === "Financial Aid") {
        paid += s.familyPaid ?? 0;
        fa += s.schoolOwes ?? 0;
      }
      if (s.alertFlag || s.duplicateFlag) flagged = true;
    }
    out.push({
      time: fmtTime(head.submissionDate),
      parentFirst: pf,
      parentLast: pl,
      address: addr.address,
      address2: addr.address2,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      phone: head.parentPhone,
      email: head.parentEmail,
      numStudents: list.length,
      students: list.slice(0, 3),
      location: head.stopAddress || "",
      rt, ow, paid, fa,
      flagged,
    });
  }
  // Sort by time desc
  out.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  return out;
}

function familyToRow(f: FamilyRow): (string | number)[] {
  const studentCols: (string | number)[] = [];
  for (let i = 0; i < 3; i++) {
    const s = f.students[i];
    if (s) {
      const [sf, sl] = splitName(s.studentName);
      studentCols.push(sf, sl, s.grade || "", serviceLabel(s));
    } else {
      studentCols.push("", "", "", "");
    }
  }
  return [
    f.time, f.parentFirst, f.parentLast,
    f.address, f.address2, f.city, f.state, f.zip,
    f.phone, f.email, f.numStudents,
    ...studentCols,
    f.location,
    f.rt || 0, f.ow || 0, f.paid || 0, f.fa || 0,
  ];
}

// --- styling -----------------------------------------------------------------

const COLOR_GREEN = "C6EFCE";
const COLOR_WHITE = "FFFFFF";
const COLOR_RED = "FFC7CE";
const COLOR_HEADER = "1F4E78";
const COLOR_TOTAL = "FFE699";

function styleCell(value: string | number, fill: string, opts: {
  bold?: boolean; color?: string; number?: boolean; money?: boolean; center?: boolean;
} = {}) {
  const cell: XLSX.CellObject = {
    v: value as XLSX.CellObject["v"],
    t: opts.number ? "n" : "s",
    s: {
      fill: { patternType: "solid", fgColor: { rgb: fill } },
      font: { bold: !!opts.bold, color: { rgb: opts.color || "000000" }, name: "Arial", sz: 10 },
      alignment: { vertical: "center", horizontal: opts.center ? "center" : "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "D0D0D0" } },
        bottom: { style: "thin", color: { rgb: "D0D0D0" } },
        left: { style: "thin", color: { rgb: "D0D0D0" } },
        right: { style: "thin", color: { rgb: "D0D0D0" } },
      },
    },
  };
  if (opts.money) (cell as any).z = '"$"#,##0.00';
  return cell;
}

function buildSheet(families: FamilyRow[]): XLSX.WorkSheet {
  const totalPaid = families.reduce((a, f) => a + f.paid, 0);
  const totalFA = families.reduce((a, f) => a + f.fa, 0);
  const totalRT = families.reduce((a, f) => a + f.rt, 0);
  const totalOW = families.reduce((a, f) => a + f.ow, 0);

  const moneyCols = new Set([24, 25, 26, 27]); // RT, OW, Paid, F/A indices

  const aoa: XLSX.CellObject[][] = [];

  // Row 1 — totals banner
  const bannerRow: XLSX.CellObject[] = HEADERS.map((_, i) => {
    if (i === 0) {
      return styleCell(
        `TOTAL CASH IN HAND: $${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   FINANCIAL AID OWED: $${totalFA.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        COLOR_TOTAL,
        { bold: true, color: "000000" },
      );
    }
    if (i === 24) return styleCell(totalRT, COLOR_TOTAL, { bold: true, number: true, money: true, center: true });
    if (i === 25) return styleCell(totalOW, COLOR_TOTAL, { bold: true, number: true, money: true, center: true });
    if (i === 26) return styleCell(totalPaid, COLOR_TOTAL, { bold: true, number: true, money: true, center: true });
    if (i === 27) return styleCell(totalFA, COLOR_TOTAL, { bold: true, number: true, money: true, center: true });
    return styleCell("", COLOR_TOTAL, { bold: true });
  });
  aoa.push(bannerRow);

  // Row 2 — headers
  aoa.push(HEADERS.map((h) => styleCell(h, COLOR_HEADER, { bold: true, color: "FFFFFF", center: true })));

  // Data rows
  families.forEach((f, idx) => {
    const values = familyToRow(f);
    const fill = f.flagged ? COLOR_RED : (idx % 2 === 0 ? COLOR_GREEN : COLOR_WHITE);
    const row = values.map((v, ci) => {
      const isMoney = moneyCols.has(ci);
      const isNumber = isMoney || ci === 10; // num students
      return styleCell(
        isNumber ? Number(v) || 0 : String(v ?? ""),
        fill,
        { number: isNumber, money: isMoney, center: isNumber },
      );
    });
    aoa.push(row);
  });

  const sheet: XLSX.WorkSheet = {};
  const range = { s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: HEADERS.length - 1 } };
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < HEADERS.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      sheet[addr] = aoa[r][c];
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range(range);
  sheet["!cols"] = COL_WIDTHS.map((w) => ({ wch: w }));
  sheet["!rows"] = aoa.map((_, i) => ({ hpt: i === 0 ? 24 : i === 1 ? 30 : 18 }));
  // Merge the banner across the first stretch of cells up to column W (before RT)
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 23 } }];
  return sheet;
}

// --- public API --------------------------------------------------------------

const dedupeKey = (r: StudentRow) =>
  `${r.studentName.toLowerCase().trim()}|${r.parentEmail.toLowerCase().trim()}|${r.schoolName.toLowerCase().trim()}`;

export function exportMaster(newRows: StudentRow[]) {
  const existing = storage.getMaster();
  const map = new Map<string, StudentRow>();
  for (const r of existing) map.set(dedupeKey(r), r);
  for (const r of newRows) map.set(dedupeKey(r), r);
  const merged = Array.from(map.values());
  storage.setMaster(merged);
  downloadWorkbook(merged, "BB_Transit_Master.xlsx");
}

export function exportRows(rows: StudentRow[], filename = "BB_Transit_Export.xlsx") {
  downloadWorkbook(rows, filename);
}

function downloadWorkbook(rows: StudentRow[], filename: string) {
  const wb = XLSX.utils.book_new();
  const families = buildFamilies(rows);
  XLSX.utils.book_append_sheet(wb, buildSheet(families), "MASTER");
  XLSX.writeFile(wb, filename);
}

export function exportStudentsClean(rows: StudentRow[], filename = "BB_Transit_Students.xlsx") {
  downloadWorkbook(rows, filename);
}

export function exportRoutesWorkbook(rows: StudentRow[]) {
  const wb = XLSX.utils.book_new();
  const families = buildFamilies(rows);
  XLSX.utils.book_append_sheet(wb, buildSheet(families), "MASTER");
  XLSX.writeFile(wb, "BB_Transit_Routes.xlsx");
}
