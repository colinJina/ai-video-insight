import Link from "next/link";

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

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const session = await requireAppSession();
  const { query } = await searchParams;
  const normalizedQuery = normalizeQuery(query);
  const tasks = await listAnalysisTasksForUser({
    userId: session.user.id,
    archived: false,
    query: normalizedQuery,
  });

  return (
    <AppShell compact>
      <PageHeader
        aside={
          <Link
            className="inline-flex rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02]"
            href="/dashboard"
          >
            新建分析
          </Link>
        }
        description="这里集中展示当前账号的全部分析记录，支持搜索、查看详情和一键归档。默认按创建时间倒序排列。"
        eyebrow="Library"
        title={normalizedQuery ? `搜索 “${normalizedQuery}”` : "资料库"}
      />
      <LibrarySearchForm
        initialQuery={normalizedQuery}
        key={normalizedQuery ?? "library-search"}
      />
      <AnalysisGrid archived={false} query={normalizedQuery} tasks={tasks} />
    </AppShell>
  );
}
