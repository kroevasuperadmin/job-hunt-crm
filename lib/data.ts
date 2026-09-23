import applications from "@/data/applications.json";
import stats from "@/data/stats.json";
import type { Application, Stats } from "./types";

export function getApplications(): Application[] {
  return applications as Application[];
}

export function getStats(): Stats {
  return stats as Stats;
}
