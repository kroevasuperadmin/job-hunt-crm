import type { Application, Stats } from "./types";

export function computeStats(applications: Application[]): Stats {
  const byStatus: Record<string, number> = {};
  const byCompany: Record<string, number> = {};

  for (const app of applications) {
    const status = app.status || "UNKNOWN";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const company = app.company || "Unknown";
    byCompany[company] = (byCompany[company] ?? 0) + 1;
  }

  const topCompanies = Object.entries(byCompany)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([company, count]) => ({ company, count }));

  return {
    totalApplications: applications.length,
    byStatus,
    byCompany,
    topCompanies,
  };
}
