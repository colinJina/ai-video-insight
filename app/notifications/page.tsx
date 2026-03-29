import AppShell from "@/components/app/AppShell";
import EmptyState from "@/components/app/EmptyState";
import PageHeader from "@/components/app/PageHeader";
import NotificationsList from "@/components/notifications/NotificationsList";
import { requireAppSession } from "@/lib/auth/guards";
import { listNotificationsForUser } from "@/lib/notifications/service";

export default async function NotificationsPage() {
  const session = await requireAppSession("/notifications");
  const notifications = await listNotificationsForUser(session.user.id);

  return (
    <AppShell compact>
      <PageHeader
        aside={
          <div className="rounded-[1.25rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.48)] px-4 py-4 text-sm leading-7 text-[color:var(--text-muted)]">
            未读数量会同步回导航栏，分析完成、失败和系统提示会统一收进这里。
          </div>
        }
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
