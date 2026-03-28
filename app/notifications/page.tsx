import AppShell from "@/components/app/AppShell";
import EmptyState from "@/components/app/EmptyState";
import PageHeader from "@/components/app/PageHeader";
import NotificationsList from "@/components/notifications/NotificationsList";
import { requireAppSession } from "@/lib/auth/guards";
import { listNotificationsForUser } from "@/lib/notifications/service";

export default async function NotificationsPage() {
  const session = await requireAppSession();
  const notifications = await listNotificationsForUser(session.user.id);

  return (
    <AppShell compact>
      <PageHeader
        description="分析完成、失败以及系统提示都会汇总在这里，方便你统一处理和回看。"
        eyebrow="Notifications"
        title="通知中心"
      />

      {notifications.length === 0 ? (
        <EmptyState
          description="还没有任何通知。创建一次分析后，系统会在这里同步状态变化。"
          eyebrow="Inbox"
          title="通知中心暂时安静"
        />
      ) : (
        <NotificationsList notifications={notifications} />
      )}
    </AppShell>
  );
}
