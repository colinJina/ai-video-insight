import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function LibraryLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="Loading your analysis records now."
        eyebrow="Library"
        title="Library"
      />
      <AnalysisGridSkeleton />
    </AppShell>
  );
}
