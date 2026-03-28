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
              返回资料库
            </Link>
          ) : undefined
        }
        description={
          query
            ? `没有找到与“${query}”相关的分析记录，试试标题、摘要或视频链接中的其他关键词。`
            : archived
              ? "你还没有归档任何记录。归档后的分析会集中在这里，方便长期整理。"
              : "资料库还没有内容。先去分析一个视频，完成后这里会自动按创建时间倒序展示。"
        }
        eyebrow={archived ? "Archive" : "Library"}
        title={archived ? "归档区还是空的" : "还没有分析记录"}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[1.25rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.48)] px-4 py-4 text-sm text-[color:var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          共 <span className="font-semibold text-white">{tasks.length}</span> 条记录，
          默认按创建时间倒序展示。
        </p>
        {query ? (
          <Link className="text-primary transition-colors hover:text-white" href="/library">
            清除搜索条件
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
