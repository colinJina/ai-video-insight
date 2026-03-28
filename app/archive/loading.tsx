import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function ArchiveLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="正在读取归档内容，请稍候。"
        eyebrow="Archive"
        title="归档"
      />
      <AnalysisGridSkeleton />
    </AppShell>
  );
}
