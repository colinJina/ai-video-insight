import Link from "next/link";

import AppShell from "@/components/app/AppShell";
import StatusBadge from "@/components/app/StatusBadge";
import { getAnalysisTask, getAnalysisTaskForUser } from "@/lib/analysis/services/tasks";
import { getOptionalAppSession } from "@/lib/auth/session";
import { isUploadedVideoSource } from "@/lib/analysis/utils";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getOptionalAppSession();
  const analysis = session
    ? await getAnalysisTaskForUser(id, session.user.id)
    : await getAnalysisTask(id);
  const isUploadedVideo = isUploadedVideoSource(analysis.video);

  return (
    <AppShell compact>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[color:rgba(88,66,53,0.18)] pb-6">
        <div>
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
            Analysis Detail
          </p>
          <h1 className="mt-4 font-headline text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
            {analysis.result?.title ?? analysis.video.title}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
            Created {formatDate(analysis.createdAt)}, last updated {formatDate(analysis.updatedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={analysis.status} />
          {session ? (
            <Link
              className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
              href="/library"
            >
              Back To Library
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
                {isUploadedVideo ? "Uploaded File" : "Source URL"}
              </p>
              {isUploadedVideo ? (
                <p className="mt-3 block break-all text-sm leading-7 text-[color:var(--text-muted)]">
                  {analysis.video.fileName ?? analysis.video.title}
                </p>
              ) : (
                <a
                  className="mt-3 block break-all text-sm leading-7 text-[color:var(--text-muted)] hover:text-primary"
                  href={analysis.video.originalUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {analysis.video.originalUrl}
                </a>
              )}
            </div>

            <div>
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
                Summary
              </p>
              <p className="mt-3 text-sm leading-8 text-[color:var(--text-muted)]">
                {analysis.result?.summary ??
                  analysis.errorMessage ??
                  "The summary has not been generated yet. Refresh in a moment to check the latest status."}
              </p>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            Key Status
          </p>
          <dl className="mt-5 space-y-4 text-sm leading-7 text-[color:var(--text-muted)]">
            <div className="flex justify-between gap-4">
              <dt>Title</dt>
              <dd className="text-right text-white">
                {analysis.result?.title ?? analysis.video.title}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Video Source</dt>
              <dd className="text-right text-white">{analysis.video.host}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Transcript Source</dt>
              <dd className="text-right text-white">
                {analysis.transcriptSource ?? "Not generated yet"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Archive State</dt>
              <dd className="text-right text-white">
                {analysis.archivedAt ? "Archived" : "Active Library"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            Timeline Outline
          </p>
          <div className="mt-5 space-y-4">
            {analysis.result?.outline?.length ? (
              analysis.result.outline.map((item) => (
                <div
                  key={`${item.time ?? "none"}-${item.text}`}
                  className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4"
                >
                  <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                    {item.time ?? "No timestamp"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                    {item.text}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-[color:var(--text-muted)]">
                No outline is available yet.
              </p>
            )}
          </div>
        </section>

        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            Conversation History
          </p>
          <div className="mt-5 space-y-4">
            {analysis.chatMessages.length > 0 ? (
              analysis.chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "assistant"
                      ? "rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4 text-sm leading-7 text-[color:var(--text-muted)]"
                      : "rounded-2xl border border-primary/20 bg-[color:rgba(255,127,0,0.06)] p-4 text-sm leading-7 text-white"
                  }
                >
                  {message.content}
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-[color:var(--text-muted)]">
                This record does not have any conversation history yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
