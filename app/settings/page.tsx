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
            <MetricTile hint="同步账号展示信息" label="资料" value="Profile" />
            <MetricTile hint="管理通知与主题偏好" label="偏好" value="Preferences" />
          </div>
        }
        description="在这里维护昵称、头像、通知偏好和主题设置。登录后会同步到数据库。"
        eyebrow="Settings"
        title="个人设置"
      />
      <SettingsForm authenticated initialSettings={settings} />
    </AppShell>
  );
}
