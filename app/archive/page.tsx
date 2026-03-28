import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGrid from "@/components/library/AnalysisGrid";
import LibrarySearchForm from "@/components/library/LibrarySearchForm";
import { listAnalysisTasksForUser } from "@/lib/analysis/service";
import { requireAppSession } from "@/lib/auth/guards";

function normalizeQuery(query?: string | string[]) {
  if (Array.isArray(query)) {
    return query[0]?.trim() || undefined;
  }

  return query?.trim() || undefined;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const session = await requireAppSession();
  const { query } = await searchParams;
  const normalizedQuery = normalizeQuery(query);
  const tasks = await listAnalysisTasksForUser({
    userId: session.user.id,
    archived: true,
    query: normalizedQuery,
  });

  return (
    <AppShell compact>
      <PageHeader
        description="归档区用于沉淀已经完成整理的分析记录。你可以随时把内容移回资料库继续使用。"
        eyebrow="Archive"
        title={normalizedQuery ? `归档搜索 “${normalizedQuery}”` : "归档"}
      />
      <LibrarySearchForm
        initialQuery={normalizedQuery}
        key={normalizedQuery ?? "archive-search"}
      />
      <AnalysisGrid archived query={normalizedQuery} tasks={tasks} />
    </AppShell>
  );
}
