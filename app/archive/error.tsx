"use client";

import Link from "next/link";

import PageErrorState from "@/components/app/PageErrorState";
import PageHeader from "@/components/app/PageHeader";

export default function ArchiveError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            className="inline-flex rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
            href="/archive"
          >
            返回归档
          </Link>
        </div>
      <PageHeader
        description="归档内容加载失败。你可以立即重试，不需要重新打开页面。"
        eyebrow="Archive"
        title="归档暂时不可用"
      />
      <PageErrorState
        description="如果问题持续存在，请检查数据库连接和当前账号的数据权限。"
        onRetry={reset}
        title="这次没有成功取回归档记录"
      />
      </div>
    </main>
  );
}
