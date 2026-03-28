import Link from "next/link";

import AppShell from "@/components/app/AppShell";
import StatusBadge from "@/components/app/StatusBadge";
import { getAnalysisTask, getAnalysisTaskForUser } from "@/lib/analysis/service";
import { getOptionalAppSession } from "@/lib/auth/session";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
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
            创建于 {formatDate(analysis.createdAt)}，最近更新于 {formatDate(analysis.updatedAt)}。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={analysis.status} />
          {session ? (
            <Link
              className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
              href="/library"
            >
              返回资料库
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
                视频链接
              </p>
              <a
                className="mt-3 block break-all text-sm leading-7 text-[color:var(--text-muted)] hover:text-primary"
                href={analysis.video.originalUrl}
                rel="noreferrer"
                target="_blank"
              >
                {analysis.video.originalUrl}
              </a>
            </div>

            <div>
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
                摘要
              </p>
              <p className="mt-3 text-sm leading-8 text-[color:var(--text-muted)]">
                {analysis.result?.summary ??
                  analysis.errorMessage ??
                  "摘要还未生成，请稍后刷新页面查看最新状态。"}
              </p>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            关键状态
          </p>
          <dl className="mt-5 space-y-4 text-sm leading-7 text-[color:var(--text-muted)]">
            <div className="flex justify-between gap-4">
              <dt>标题</dt>
              <dd className="text-right text-white">
                {analysis.result?.title ?? analysis.video.title}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>视频来源</dt>
              <dd className="text-right text-white">{analysis.video.host}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>转写来源</dt>
              <dd className="text-right text-white">
                {analysis.transcriptSource ?? "尚未生成"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>归档状态</dt>
              <dd className="text-right text-white">
                {analysis.archivedAt ? "已归档" : "资料库中"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            时间线大纲
          </p>
          <div className="mt-5 space-y-4">
            {analysis.result?.outline?.length ? (
              analysis.result.outline.map((item) => (
                <div
                  key={`${item.time ?? "none"}-${item.text}`}
                  className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4"
                >
                  <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                    {item.time ?? "无时间点"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                    {item.text}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-[color:var(--text-muted)]">
                暂无可展示的大纲。
              </p>
            )}
          </div>
        </section>

        <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            对话记录
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
                这条记录还没有对话历史。
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
