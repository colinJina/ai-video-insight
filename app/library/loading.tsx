import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGridSkeleton from "@/components/library/AnalysisGridSkeleton";

export default function LibraryLoading() {
  return (
    <AppShell compact>
      <PageHeader
        description="正在加载你的分析记录，请稍候。"
        eyebrow="Library"
        title="资料库"
      />
      <AnalysisGridSkeleton />
    </AppShell>
  );
}
