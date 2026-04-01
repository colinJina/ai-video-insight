import AppShell from "@/components/app/AppShell";
import MetricTile from "@/components/app/MetricTile";
import PageHeader from "@/components/app/PageHeader";
import SettingsForm from "@/components/settings/SettingsForm";
import { requireAppSession } from "@/lib/auth/guards";
import { getSettingsForUser } from "@/lib/settings/service";

export default async function SettingsPage() {
  const session = await requireAppSession("/settings");
  const settings = await getSettingsForUser(session.user.id);

  return (
    <AppShell compact>
      <PageHeader
        aside={
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile hint="Sync profile details across the app" label="Profile" value="Profile" />
            <MetricTile hint="Control alerts and appearance" label="Preferences" value="Preferences" />
          </div>
        }
        description="Manage your display name, avatar, notification preferences, and theme settings. Signed-in changes sync to the database."
        eyebrow="Settings"
        title="Personal Settings"
      />
      <SettingsForm authenticated initialSettings={settings} />
    </AppShell>
  );
}
