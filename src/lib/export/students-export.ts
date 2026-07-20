import XLSX from "xlsx-js-style";
import type { StudentRow } from "@/lib/types";
import { totalsForStudent, isFinancialAid } from "@/lib/financial-aid";
import { familyKeyOf } from "@/lib/payment-plans";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ExportOptions {
  /** Which schools to include. Empty/undefined = all schools. */
  schools?: string[];
  /** Payment status filter. Undefined = all. */
  paymentStatus?: "all" | "paid" | "pending" | "unpaid";
  /** Include only Financial Aid students. */
  financialAidOnly?: boolean;
  /** Family keys for families with an active payment plan (from live client state). */
  planFamilyKeys?: Set<string>;
  /** One tab per school in addition to the Summary tab. */
  splitBySchool?: boolean;
  /** Season label for the header (e.g. "2026-2027"). */
  schoolYear?: string;
  /** Overrides "generated at" timestamp; defaults to now. */
  generatedAt?: Date;
  /** Filename override. */
  filename?: string;
}

// -----------------------------------------------------------------------------
// Address parsing (mirror of src/lib/excel.ts, kept local for isolation)
// -----------------------------------------------------------------------------

function parseAddress(input: string) {
  const raw = (input || "").trim();
  const empty = { address: "", city: "", state: "", zip: "" };
  if (!raw) return empty;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let state = "";
  let zip = "";
  if (parts.length) {
    const last = parts[parts.length - 1];
    const m = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) { state = m[1].toUpperCase(); zip = m[2]; parts.pop(); }
    else {
      const zm = last.match(/^(\d{5}(?:-\d{4})?)$/);
      if (zm) { zip = zm[1]; parts.pop(); }
      const sm = parts.length ? parts[parts.length - 1].match(/^([A-Za-z]{2})$/) : null;
      if (sm) { state = sm[1].toUpperCase(); parts.pop(); }
    }
  }
  const city = parts.length ? parts.pop()! : "";
  const address = parts.join(", ");
  return { address, city, state, zip };
}

// -----------------------------------------------------------------------------
// Derived per-row values
// -----------------------------------------------------------------------------

interface DerivedRow {
  raw: StudentRow;
  schoolName: string;
  studentName: string;
  grade: string;
  route: string;         // no distinct route field; kept for future
  busStop: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  address: string;
  town: string;
  paymentTypeLabel: string;   // Self Pay | Financial Aid | Payment Plan | Unpaid
  paymentStatusLabel: string; // Paid | Pending | Unpaid | Overdue
  amountPaid: number;
  balanceDue: number;
  financialAid: boolean;
  paymentPlan: boolean;
  notes: string;
}

function derive(r: StudentRow, planFamilyKeys?: Set<string>): DerivedRow {
  const onPlan = !!planFamilyKeys?.has(familyKeyOf(r));
  const baseType = r.paymentType || (r.paid ? "Self Pay" : "Unpaid");
  const paymentTypeLabel = onPlan ? "Payment Plan" : baseType;

  const addr = parseAddress(r.parentAddress);

  let amountPaid = 0;
  let balanceDue = 0;
  if (isFinancialAid(r)) {
    const t = totalsForStudent(r);
    amountPaid = t.collected;
    balanceDue = t.outstanding;
  } else {
    const cost = (r.rtAmount ?? 0) + (r.owAmount ?? 0);
    amountPaid = r.amountPaid ?? (r.paid ? cost : 0);
    balanceDue = Math.max(0, cost - amountPaid);
  }

  const paymentStatusLabel = (() => {
    if (r.paymentStatus === "Overdue") return "Overdue";
    if (r.paymentStatus === "Received") return "Paid";
    if (paymentTypeLabel === "Unpaid") return "Unpaid";
    return "Pending";
  })();

  return {
    raw: r,
    schoolName: r.schoolName || "—",
    studentName: r.studentName || "—",
    grade: r.grade || "",
    route: "",
    busStop: r.stopAddress || "",
    parentName: r.parentName || "",
    parentPhone: r.parentPhone || "",
    parentEmail: r.parentEmail || "",
    address: addr.address || r.parentAddress || "",
    town: addr.city,
    paymentTypeLabel,
    paymentStatusLabel,
    amountPaid,
    balanceDue,
    financialAid: isFinancialAid(r),
    paymentPlan: onPlan,
    notes: r.notes || "",
  };
}

// -----------------------------------------------------------------------------
// Styling
// -----------------------------------------------------------------------------

const C = {
  header: "1F4E78",       // school header bar
  headerText: "FFFFFF",
  summaryTitle: "0B3D5C",
  totals: "FFE699",       // school subtotal
  zebraA: "FFFFFF",
  zebraB: "F5F8FB",
  paid: "C6EFCE",         // green
  pending: "FFF2CC",      // yellow
  unpaid: "FFC7CE",       // red
  fa: "DDEBF7",           // light blue tint
  border: "D0D0D0",
};

type CellOpts = {
  bold?: boolean;
  color?: string;
  fill?: string;
  number?: boolean;
  money?: boolean;
  center?: boolean;
  right?: boolean;
  size?: number;
  wrap?: boolean;
};

function cell(value: string | number | null | undefined, opts: CellOpts = {}): XLSX.CellObject {
  const isNumber = opts.number || opts.money;
  const v = value == null ? "" : value;
  const c: XLSX.CellObject = {
    v: isNumber ? (Number(v) || 0) : String(v),
    t: isNumber ? "n" : "s",
    s: {
      fill: opts.fill ? { patternType: "solid", fgColor: { rgb: opts.fill } } : undefined,
      font: {
        name: "Calibri",
        sz: opts.size ?? 10,
        bold: !!opts.bold,
        color: { rgb: opts.color || "1F2937" },
      },
      alignment: {
        vertical: "center",
        horizontal: opts.center ? "center" : opts.right ? "right" : "left",
        wrapText: !!opts.wrap,
      },
      border: {
        top: { style: "thin", color: { rgb: C.border } },
        bottom: { style: "thin", color: { rgb: C.border } },
        left: { style: "thin", color: { rgb: C.border } },
        right: { style: "thin", color: { rgb: C.border } },
      },
    },
  };
  if (opts.money) (c as any).z = '"$"#,##0.00';
  return c;
}

// -----------------------------------------------------------------------------
// Column layout for detail sheets
// -----------------------------------------------------------------------------

const COLUMNS: Array<{
  key: keyof DerivedRow | "flags";
  label: string;
  width: number;
  money?: boolean;
  center?: boolean;
  wrap?: boolean;
}> = [
  { key: "studentName", label: "Student Name", width: 22 },
  { key: "grade", label: "Grade", width: 8, center: true },
  { key: "schoolName", label: "School", width: 26 },
  { key: "busStop", label: "Bus Stop", width: 30, wrap: true },
  { key: "parentName", label: "Parent / Guardian", width: 22 },
  { key: "parentPhone", label: "Phone", width: 15 },
  { key: "parentEmail", label: "Email", width: 28 },
  { key: "address", label: "Address", width: 28, wrap: true },
  { key: "town", label: "Town", width: 14 },
  { key: "paymentTypeLabel", label: "Payment Type", width: 15, center: true },
  { key: "paymentStatusLabel", label: "Payment Status", width: 14, center: true },
  { key: "amountPaid", label: "Amount Paid", width: 13, money: true },
  { key: "balanceDue", label: "Balance Due", width: 13, money: true },
  { key: "flags", label: "Flags", width: 18, center: true },
  { key: "notes", label: "Internal Notes", width: 32, wrap: true },
];

function rowFillFor(d: DerivedRow, idx: number): string {
  if (d.paymentStatusLabel === "Paid") return C.paid;
  if (d.paymentStatusLabel === "Overdue" || d.paymentStatusLabel === "Unpaid") return C.unpaid;
  if (d.paymentStatusLabel === "Pending") return C.pending;
  return idx % 2 === 0 ? C.zebraA : C.zebraB;
}

function flagsFor(d: DerivedRow): string {
  const out: string[] = [];
  if (d.financialAid) out.push("FA");
  if (d.paymentPlan) out.push("PP");
  if (d.raw.alertFlag) out.push("!");
  if (d.raw.duplicateFlag) out.push("DUP");
  return out.join(" • ");
}

// -----------------------------------------------------------------------------
// Sheet builders
// -----------------------------------------------------------------------------

function writeSheet(rows: XLSX.CellObject[][], widths: number[], merges: XLSX.Range[] = [], heights: number[] = []): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const cols = widths.length;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (!rows[r][c]) continue;
      sheet[XLSX.utils.encode_cell({ r, c })] = rows[r][c];
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: cols - 1 } });
  sheet["!cols"] = widths.map((w) => ({ wch: w }));
  sheet["!rows"] = rows.map((_, i) => ({ hpt: heights[i] ?? (i === 0 ? 26 : 18) }));
  sheet["!merges"] = merges;
  sheet["!freeze"] = { xSplit: 0, ySplit: 3 } as any;
  return sheet;
}

function buildSchoolSheet(schoolName: string, derived: DerivedRow[], schoolYear: string, generatedAt: Date): XLSX.WorkSheet {
  const widths = COLUMNS.map((c) => c.width);
  const nCols = COLUMNS.length;
  const rows: XLSX.CellObject[][] = [];
  const merges: XLSX.Range[] = [];

  // Row 0: title banner
  const title = `${schoolName} — ${schoolYear} Season`;
  const titleRow: XLSX.CellObject[] = Array.from({ length: nCols }, (_, i) =>
    i === 0
      ? cell(title, { fill: C.header, color: C.headerText, bold: true, size: 14 })
      : cell("", { fill: C.header }),
  );
  rows.push(titleRow);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } });

  // Row 1: meta
  const totalStudents = derived.length;
  const totalCollected = derived.reduce((a, d) => a + d.amountPaid, 0);
  const totalDue = derived.reduce((a, d) => a + d.balanceDue, 0);
  const metaText = `Students: ${totalStudents}   •   Generated: ${generatedAt.toLocaleString()}`;
  const metaRow: XLSX.CellObject[] = Array.from({ length: nCols }, (_, i) => {
    if (i === 0) return cell(metaText, { fill: C.zebraB, color: "374151", size: 10 });
    if (i === nCols - 4) return cell("Collected", { fill: C.zebraB, bold: true, center: true });
    if (i === nCols - 3) return cell(totalCollected, { fill: C.zebraB, money: true, bold: true });
    if (i === nCols - 2) return cell("Balance", { fill: C.zebraB, bold: true, center: true });
    if (i === nCols - 1) return cell(totalDue, { fill: C.zebraB, money: true, bold: true });
    return cell("", { fill: C.zebraB });
  });
  rows.push(metaRow);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 5 } });

  // Row 2: header
  rows.push(COLUMNS.map((col) =>
    cell(col.label, { fill: C.header, color: C.headerText, bold: true, center: true, size: 11 }),
  ));

  // Data rows, sorted by bus stop then student name
  const sorted = [...derived].sort((a, b) =>
    (a.busStop || "~").localeCompare(b.busStop || "~") ||
    a.studentName.localeCompare(b.studentName),
  );

  sorted.forEach((d, idx) => {
    const fill = rowFillFor(d, idx);
    const row = COLUMNS.map((col) => {
      if (col.key === "flags") {
        return cell(flagsFor(d), { fill, center: true, bold: true, color: d.raw.alertFlag ? "B91C1C" : "374151" });
      }
      const value = (d as any)[col.key];
      return cell(value, {
        fill,
        money: !!col.money,
        number: !!col.money,
        center: !!col.center,
        wrap: !!col.wrap,
      });
    });
    rows.push(row);
  });

  // Subtotal row
  const subtotal: XLSX.CellObject[] = COLUMNS.map((col, i) => {
    if (i === 0) return cell(`Subtotal — ${schoolName}`, { fill: C.totals, bold: true });
    if (col.key === "amountPaid") return cell(totalCollected, { fill: C.totals, money: true, bold: true });
    if (col.key === "balanceDue") return cell(totalDue, { fill: C.totals, money: true, bold: true });
    return cell("", { fill: C.totals, bold: true });
  });
  rows.push(subtotal);

  const heights = rows.map((_, i) => (i === 0 ? 28 : i === 2 ? 24 : 18));
  return writeSheet(rows, widths, merges, heights);
}

function buildSummarySheet(all: DerivedRow[], perSchool: Map<string, DerivedRow[]>, schoolYear: string, generatedAt: Date): XLSX.WorkSheet {
  const widths = [30, 12, 12, 14, 15, 15, 15, 15];
  const nCols = widths.length;
  const rows: XLSX.CellObject[][] = [];
  const merges: XLSX.Range[] = [];

  // Title
  rows.push(Array.from({ length: nCols }, (_, i) =>
    i === 0
      ? cell(`B & B Transit — Registration Summary (${schoolYear})`, { fill: C.summaryTitle, color: "FFFFFF", bold: true, size: 15 })
      : cell("", { fill: C.summaryTitle }),
  ));
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } });

  // Meta
  rows.push([
    cell(`Generated: ${generatedAt.toLocaleString()}`, { fill: C.zebraB, color: "374151" }),
    ...Array.from({ length: nCols - 1 }, () => cell("", { fill: C.zebraB })),
  ]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } });

  // Grand totals band
  const totalStudents = all.length;
  const totalFA = all.filter((d) => d.financialAid).length;
  const totalPP = all.filter((d) => d.paymentPlan).length;
  const paid = all.filter((d) => d.paymentStatusLabel === "Paid").length;
  const pending = all.filter((d) => d.paymentStatusLabel === "Pending").length;
  const unpaid = all.filter((d) => d.paymentStatusLabel === "Unpaid" || d.paymentStatusLabel === "Overdue").length;
  const collected = all.reduce((a, d) => a + d.amountPaid, 0);
  const balance = all.reduce((a, d) => a + d.balanceDue, 0);

  const kpiPairs: Array<[string, string | number, boolean?]> = [
    ["Total Students", totalStudents],
    ["Paid", paid],
    ["Pending", pending],
    ["Unpaid / Overdue", unpaid],
    ["Financial Aid", totalFA],
    ["Payment Plans", totalPP],
    ["Cash Collected", collected, true],
    ["Outstanding Balance", balance, true],
  ];
  kpiPairs.forEach(([label, value, money]) => {
    rows.push([
      cell(label, { fill: C.zebraA, bold: true }),
      cell(value, { fill: C.zebraA, number: !money, money: !!money, right: true }),
      ...Array.from({ length: nCols - 2 }, () => cell("", { fill: C.zebraA })),
    ]);
    merges.push({ s: { r: rows.length - 1, c: 1 }, e: { r: rows.length - 1, c: nCols - 1 } });
  });

  // Spacer
  rows.push(Array.from({ length: nCols }, () => cell("", { fill: C.zebraA })));

  // Per-school breakdown header
  const headers = ["School", "Students", "Paid", "Pending", "Unpaid", "Financial Aid", "Collected", "Balance"];
  rows.push(headers.map((h) => cell(h, { fill: C.header, color: C.headerText, bold: true, center: true, size: 11 })));

  const entries = Array.from(perSchool.entries()).sort((a, b) => b[1].length - a[1].length);
  entries.forEach(([school, list], idx) => {
    const cFill = idx % 2 === 0 ? C.zebraA : C.zebraB;
    const sPaid = list.filter((d) => d.paymentStatusLabel === "Paid").length;
    const sPend = list.filter((d) => d.paymentStatusLabel === "Pending").length;
    const sUnp = list.filter((d) => d.paymentStatusLabel === "Unpaid" || d.paymentStatusLabel === "Overdue").length;
    const sFA = list.filter((d) => d.financialAid).length;
    const sCol = list.reduce((a, d) => a + d.amountPaid, 0);
    const sBal = list.reduce((a, d) => a + d.balanceDue, 0);
    rows.push([
      cell(school, { fill: cFill, bold: true }),
      cell(list.length, { fill: cFill, number: true, center: true }),
      cell(sPaid, { fill: cFill, number: true, center: true }),
      cell(sPend, { fill: cFill, number: true, center: true }),
      cell(sUnp, { fill: cFill, number: true, center: true }),
      cell(sFA, { fill: cFill, number: true, center: true }),
      cell(sCol, { fill: cFill, money: true }),
      cell(sBal, { fill: cFill, money: true }),
    ]);
  });

  // Grand total row
  rows.push([
    cell("Grand Total", { fill: C.totals, bold: true }),
    cell(totalStudents, { fill: C.totals, number: true, center: true, bold: true }),
    cell(paid, { fill: C.totals, number: true, center: true, bold: true }),
    cell(pending, { fill: C.totals, number: true, center: true, bold: true }),
    cell(unpaid, { fill: C.totals, number: true, center: true, bold: true }),
    cell(totalFA, { fill: C.totals, number: true, center: true, bold: true }),
    cell(collected, { fill: C.totals, money: true, bold: true }),
    cell(balance, { fill: C.totals, money: true, bold: true }),
  ]);

  return writeSheet(rows, widths, merges, rows.map((_, i) => (i === 0 ? 30 : 18)));
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

function applyFilters(rows: StudentRow[], opts: ExportOptions): StudentRow[] {
  return rows.filter((r) => {
    if (opts.schools && opts.schools.length > 0 && !opts.schools.includes(r.schoolName)) return false;
    if (opts.financialAidOnly && !isFinancialAid(r)) return false;
    if (opts.paymentStatus && opts.paymentStatus !== "all") {
      const label =
        r.paymentStatus === "Received" ? "paid" :
        r.paymentStatus === "Overdue" ? "unpaid" :
        (r.paymentType === "Unpaid" || (!r.paid && !r.paymentType)) ? "unpaid" :
        "pending";
      if (label !== opts.paymentStatus) return false;
    }
    return true;
  });
}

function sanitizeSheetName(name: string): string {
  return (name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export function buildStudentsWorkbook(students: StudentRow[], opts: ExportOptions = {}): XLSX.WorkBook {
  const generatedAt = opts.generatedAt ?? new Date();
  const schoolYear = opts.schoolYear || `${generatedAt.getFullYear()}-${generatedAt.getFullYear() + 1}`;
  const filtered = applyFilters(students, opts);
  const derived = filtered.map((r) => derive(r, opts.planFamilyKeys));

  // Sort: School, then Bus Stop, then Student Name
  derived.sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName) ||
    (a.busStop || "~").localeCompare(b.busStop || "~") ||
    a.studentName.localeCompare(b.studentName),
  );

  const bySchool = new Map<string, DerivedRow[]>();
  derived.forEach((d) => {
    const k = d.schoolName || "Unassigned";
    if (!bySchool.has(k)) bySchool.set(k, []);
    bySchool.get(k)!.push(d);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(derived, bySchool, schoolYear, generatedAt), "Summary");

  if (opts.splitBySchool !== false) {
    const seen = new Set<string>();
    for (const [school, list] of bySchool.entries()) {
      let name = sanitizeSheetName(school);
      let n = 2;
      while (seen.has(name)) { name = sanitizeSheetName(`${school} ${n++}`); }
      seen.add(name);
      XLSX.utils.book_append_sheet(wb, buildSchoolSheet(school, list, schoolYear, generatedAt), name);
    }
  } else {
    XLSX.utils.book_append_sheet(wb, buildSchoolSheet("All Schools", derived, schoolYear, generatedAt), "All Students");
  }

  return wb;
}

export function downloadStudentsExcel(students: StudentRow[], opts: ExportOptions = {}) {
  const wb = buildStudentsWorkbook(students, opts);
  const generatedAt = opts.generatedAt ?? new Date();
  const stamp = generatedAt.toISOString().slice(0, 10);
  const scope = opts.schools && opts.schools.length === 1
    ? sanitizeSheetName(opts.schools[0]).replace(/\s+/g, "_")
    : "All_Schools";
  const filename = opts.filename || `BB_Transit_${scope}_${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { filename, count: applyFilters(students, opts).length };
}
