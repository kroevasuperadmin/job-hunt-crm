import Dashboard from "@/components/Dashboard";
import { loadCrm } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const { applications, stats, notice } = await loadCrm();
  return <Dashboard applications={applications} stats={stats} notice={notice} />;
}
