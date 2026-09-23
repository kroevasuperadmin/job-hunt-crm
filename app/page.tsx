import Dashboard from "@/components/Dashboard";
import { getApplications, getStats } from "@/lib/data";

export default function HomePage() {
  const applications = getApplications();
  const stats = getStats();

  return <Dashboard applications={applications} stats={stats} />;
}
