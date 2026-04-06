import AppShell from "@/components/app/AppShell";
import PageHeader from "@/components/app/PageHeader";
import AnalysisGrid from "@/components/library/AnalysisGrid";
import LibrarySearchForm from "@/components/library/LibrarySearchForm";
import { listAnalysisTasksForUser } from "@/lib/analysis/services/tasks";
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
  const session = await requireAppSession("/archive");
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
        description="Archive keeps completed records that you want to store out of the active library. Restore them anytime when you need them again."
        eyebrow="Archive"
        title={normalizedQuery ? `Archive search "${normalizedQuery}"` : "Archive"}
      />
      <LibrarySearchForm initialQuery={normalizedQuery} key={normalizedQuery ?? "archive-search"} />
      <AnalysisGrid archived query={normalizedQuery} tasks={tasks} />
    </AppShell>
  );
}
