import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function SettingsLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="Loading your personal settings."
        eyebrow="Settings"
        title="Personal Settings"
      />
      <AnalysisGridSkeleton count={2} />
    </AppShell>
  );
}
