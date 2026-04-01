import AppShell from "@/components/app/AppShell";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getOptionalAppSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await getOptionalAppSession();

  return (
    <AppShell>
      <DashboardClient isAuthenticated={Boolean(session)} />
    </AppShell>
  );
}
