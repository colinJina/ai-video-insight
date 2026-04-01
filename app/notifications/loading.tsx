import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function NotificationsLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="Loading your notification center."
        eyebrow="Notifications"
        title="Notification Center"
      />
      <AnalysisGridSkeleton count={3} />
    </AppShell>
  );
}
