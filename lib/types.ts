export type AppStatus = "SUBMITTED" | "SKIPPED" | "BLOCKED" | string;

export interface Application {
  id: string;
  time: string;
  company: string;
  role: string;
  url: string;
  status: AppStatus;
  confirmation: string | null;
  confirmationImage: string | null;
}

export interface Stats {
  totalApplications: number;
  byStatus: Record<string, number>;
  byCompany?: Record<string, number>;
  topCompanies?: Array<{ company: string; count: number } | string>;
  confirmationPngs?: unknown;
}
