export type Status = "New" | "Reviewed" | "Confirmed" | "Exported";

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
  submissionDate: string; // ISO
  checkNumber?: string;
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

export interface AppSettings {
  apiToken: string;
  formIds: Record<string, string>; // schoolLabel -> formId
  receipt: ReceiptSettings;
}
