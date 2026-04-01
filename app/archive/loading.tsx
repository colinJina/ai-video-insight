import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function ArchiveLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="Loading archived records."
        eyebrow="Archive"
        title="Archive"
      />
      <AnalysisGridSkeleton />
    </AppShell>
  );
}
