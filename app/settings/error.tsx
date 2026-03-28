"use client";

import Link from "next/link";

import PageErrorState from "@/components/app/PageErrorState";
import PageHeader from "@/components/app/PageHeader";

export default function SettingsError({
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
            href="/settings"
          >
            返回设置
          </Link>
        </div>
        <PageHeader
          description="设置数据加载失败。你可以立即重试。"
          eyebrow="Settings"
          title="设置暂时不可用"
        />
        <PageErrorState
          description="如果问题持续存在，请检查设置接口和当前账号数据。"
          onRetry={reset}
          title="这次没有成功取回设置"
        />
      </div>
    </main>
  );
}
