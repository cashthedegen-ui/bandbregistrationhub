export type Status = "New" | "Reviewed" | "Confirmed" | "Waitlisted";
export type PaymentStatus = "Pending" | "Received" | "Overdue";
export type PaymentType = "Self Pay" | "Financial Aid" | "Unpaid";

export interface StudentRow {
  id: string;            // unique per student row
  submissionId: string;  // formstack submission id (family)
  formId: string;
  schoolName: string;
  studentName: string;
  grade: string;
  stopAddress: string;
  stopAddress2?: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  parentAddress: string;
  notes: string;
  alertFlag: boolean;
  duplicateFlag: boolean;
  duplicateGroupId?: string;
  status: Status;
  paymentStatus: PaymentStatus;
  submissionDate: string; // ISO
  checkNumber?: string;
  paid?: boolean;
  amountPaid?: number;
  rtAmount?: number;
  owAmount?: number;
  paymentType?: PaymentType;
  financialAidNotes?: string;
  // Financial Aid split: family portion + school portion
  familyPaid?: number;
  schoolOwes?: number;
  schoolPaidReceived?: boolean;
  schoolPaidAmount?: number;
}

export interface SyncEvent {
  id: string;
  ts: string;
  total: number;
  added: number;
  updated: number;
}

export interface FormMeta {
  id: string;
  name: string;
  schoolLabel: string;
}

export interface ArchivedSeason {
  id: string;
  label: string;
  createdAt: string;
  students: StudentRow[];
}

export interface ReceiptSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  schoolYear: string;
  footer: string;
}

export interface FormEntry {
  id: string;      // local uid
  label: string;   // e.g. "Hopkins School Bus 26-27"
  formId: string;  // Formstack form id
}

export interface AppSettings {
  apiToken: string;
  forms: FormEntry[];
  receipt: ReceiptSettings;
}
