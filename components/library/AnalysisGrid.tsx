import Link from "next/link";

import EmptyState from "@/components/app/EmptyState";
import AnalysisCard from "@/components/library/AnalysisCard";
import type { AnalysisPublicTask } from "@/lib/analysis/types";

export default function AnalysisGrid({
  tasks,
  archived,
  query,
}: {
  tasks: AnalysisPublicTask[];
  archived: boolean;
  query?: string;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        action={
          archived ? (
            <Link
              className="inline-flex rounded-xl border border-[color:rgba(88,66,53,0.28)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
              href="/library"
            >
              Back To Library
            </Link>
          ) : undefined
        }
        description={
          query
            ? `No analysis matched "${query}". Try another keyword from the title, summary, or source URL.`
            : archived
              ? "You have not archived any analysis yet. Once archived, finished records stay here for long-term review."
              : "Your library is still empty. Run a video analysis first and completed records will appear here automatically."
        }
        eyebrow={archived ? "Archive" : "Library"}
        title={archived ? "Nothing archived yet" : "No analysis records yet"}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[1.25rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.48)] px-4 py-4 text-sm text-[color:var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-white">{tasks.length}</span> records, sorted by
          newest first.
        </p>
        {query ? (
          <Link className="text-primary transition-colors hover:text-white" href="/library">
            Clear Search
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <AnalysisCard key={task.id} archived={archived} task={task} />
        ))}
      </div>
    </div>
  );
}
