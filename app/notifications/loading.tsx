import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function NotificationsLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="正在加载通知中心，请稍候。"
        eyebrow="Notifications"
        title="通知中心"
      />
      <AnalysisGridSkeleton count={3} />
    </AppShell>
  );
}
