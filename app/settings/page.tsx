import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import SettingsForm from "@/components/settings/SettingsForm";
import { requireAppSession } from "@/lib/auth/guards";
import { getSettingsForUser } from "@/lib/settings/service";

export default async function SettingsPage() {
  const session = await requireAppSession();
  const settings = await getSettingsForUser(session.user.id);

  return (
    <AppShell compact>
      <PageHeader
        description="在这里维护昵称、头像、通知偏好和主题设置。登录后会同步到数据库。"
        eyebrow="Settings"
        title="个人设置"
      />
      <SettingsForm authenticated initialSettings={settings} />
    </AppShell>
  );
}
