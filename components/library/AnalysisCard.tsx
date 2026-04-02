"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import StatusBadge from "@/components/app/StatusBadge";
import type { AnalysisPublicTask } from "@/lib/analysis/types";
import { isUploadedVideoSource } from "@/lib/analysis/utils";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AnalysisCard({
  task,
  archived,
}: {
  task: AnalysisPublicTask;
  archived: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isUploadedVideo = isUploadedVideoSource(task.video);

  const handleArchiveToggle = async () => {
    setError(null);

    try {
      const response = await fetch(`/api/analysis/${task.id}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archived: !archived,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "Action failed. Please try again.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action failed. Please try again.");
    }
  };

  return (
    <article className="glass-card flex h-full flex-col rounded-[1.5rem] p-5 transition-transform duration-300 hover:-translate-y-1 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            Analysis Record
          </p>
          <h2 className="mt-3 line-clamp-2 font-headline text-xl font-bold tracking-[-0.03em] text-white">
            {task.result?.title ?? task.video.title}
          </h2>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <div className="mt-5 space-y-3 text-sm leading-7 text-[color:var(--text-muted)]">
        <p className="line-clamp-3">
          {task.result?.summary ?? task.video.description ?? "The summary is not available yet. The system is still waiting for analysis output."}
        </p>
        <div className="rounded-2xl border border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(23,12,3,0.66)] px-4 py-3 text-xs leading-6 text-[color:rgba(223,192,175,0.72)]">
          <span className="block font-headline uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            {isUploadedVideo ? "Uploaded File" : "Source URL"}
          </span>
          <span className="mt-1 block break-all">
            {isUploadedVideo ? task.video.fileName ?? task.video.title : task.video.originalUrl}
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-[color:rgba(223,192,175,0.72)]">
        <span>Created {formatDate(task.createdAt)}</span>
        {task.archivedAt ? <span>Archived {formatDate(task.archivedAt)}</span> : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-[color:rgba(255,120,120,0.24)] bg-[color:rgba(120,20,20,0.16)] px-4 py-3 text-sm text-[color:#ffb7b7]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02]"
          href={`/analysis/${task.id}`}
        >
          View Details
        </Link>
        <button
          className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            void handleArchiveToggle();
          }}
          type="button"
        >
          {isPending ? "Working..." : archived ? "Restore" : "Archive"}
        </button>
      </div>
    </article>
  );
}
