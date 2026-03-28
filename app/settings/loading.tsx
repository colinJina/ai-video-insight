import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function SettingsLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="正在读取个人设置，请稍候。"
        eyebrow="Settings"
        title="个人设置"
      />
      <AnalysisGridSkeleton count={2} />
    </AppShell>
  );
}
