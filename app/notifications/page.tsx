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
            Unread counts mirror the navbar badge, and every completion, failure, or system event lands here.
          </div>
        }
        description="This inbox collects analysis completions, failures, and system updates so you can review and clear them in one place."
        eyebrow="Notifications"
        title="Notification Center"
      />

      {notifications.length === 0 ? (
        <EmptyState
          description="No notifications yet. Once you create an analysis, status changes will start appearing here automatically."
          eyebrow="Inbox"
          title="The notification center is quiet"
        />
      ) : (
        <NotificationsList notifications={notifications} />
      )}
    </AppShell>
  );
}
