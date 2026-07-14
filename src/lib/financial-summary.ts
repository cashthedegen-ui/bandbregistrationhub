import type { StudentRow } from "./types";

/**
 * Shared financial summary used by both the Dashboard and the Analytics page.
 *
 * This is the SINGLE source of truth for dashboard/analytics revenue totals.
 * Do not compute cashCollected / outstanding / projected anywhere else — call
 * `computeFinancialSummary(students)` and read the returned fields.
 *
 * Logic mirrors the existing Analytics "Cash In Hand / Financial Aid $ / Total
 * Revenue" calculation so both surfaces stay in lock-step down to the cent.
 */

export interface FinancialSummaryRow {
  school: string;
  total: number;
  selfPay: number;
  selfPayCollected: number;
  aid: number;
  aidFamilyPaid: number;
  aidSchoolOwed: number;
  unpaid: number;
}

export interface FinancialSummary {
  bySchool: FinancialSummaryRow[];
  totals: { selfPay: number; aid: number; unpaid: number };
  /** Money actually received (Self Pay collected + Financial Aid family paid). */
  cashCollected: number;
  /** Money still owed (Financial Aid school-owed balances). */
  outstandingReceivables: number;
  /** cashCollected + outstandingReceivables — the projected season value. */
  projectedSeasonRevenue: number;
  // Legacy aliases kept for the Analytics UI so its existing labels keep working.
  grandSelfPay: number;
  grandFamilyAid: number;
  grandCashIn: number;
  grandSchoolOwed: number;
  grandTotalRevenue: number;
}

export function computeFinancialSummary(students: StudentRow[]): FinancialSummary {
  const m = new Map<string, FinancialSummaryRow>();
  for (const s of students) {
    const k = s.schoolName || "Unassigned";
    const cur =
      m.get(k) ||
      ({
        school: k,
        total: 0,
        selfPay: 0,
        selfPayCollected: 0,
        aid: 0,
        aidFamilyPaid: 0,
        aidSchoolOwed: 0,
        unpaid: 0,
      } as FinancialSummaryRow);
    cur.total += 1;
    const pt = s.paymentType || (s.paid ? "Self Pay" : "Unpaid");
    if (pt === "Self Pay") {
      cur.selfPay += 1;
      cur.selfPayCollected += Number(s.amountPaid) || 0;
    } else if (pt === "Financial Aid") {
      cur.aid += 1;
      cur.aidFamilyPaid += Number(s.familyPaid) || 0;
      cur.aidSchoolOwed += Number(s.schoolOwes) || 0;
    } else {
      cur.unpaid += 1;
    }
    m.set(k, cur);
  }
  const bySchool = Array.from(m.values()).sort((a, b) => b.total - a.total);

  const grandSelfPay = bySchool.reduce((a, b) => a + b.selfPayCollected, 0);
  const grandFamilyAid = bySchool.reduce((a, b) => a + b.aidFamilyPaid, 0);
  const grandCashIn = grandSelfPay + grandFamilyAid;
  const grandSchoolOwed = bySchool.reduce((a, b) => a + b.aidSchoolOwed, 0);
  const grandTotalRevenue = grandCashIn + grandSchoolOwed;

  const totals = bySchool.reduce(
    (a, b) => ({
      selfPay: a.selfPay + b.selfPay,
      aid: a.aid + b.aid,
      unpaid: a.unpaid + b.unpaid,
    }),
    { selfPay: 0, aid: 0, unpaid: 0 },
  );

  return {
    bySchool,
    totals,
    cashCollected: grandCashIn,
    outstandingReceivables: grandSchoolOwed,
    projectedSeasonRevenue: grandTotalRevenue,
    grandSelfPay,
    grandFamilyAid,
    grandCashIn,
    grandSchoolOwed,
    grandTotalRevenue,
  };
}
