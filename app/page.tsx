import Dashboard from "@/components/Dashboard";
import { loadCrm } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { applications, stats } = await loadCrm();
  return <Dashboard applications={applications} stats={stats} />;
}
