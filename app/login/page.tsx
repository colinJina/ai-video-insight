import Link from "next/link";
import { redirect } from "next/navigation";

import MetricTile from "@/components/app/MetricTile";
import LoginForm from "@/components/auth/LoginForm";
import { getOptionalAppSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getOptionalAppSession();

  if (session) {
    redirect("/library");
  }

  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col justify-center gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(88,66,53,0.18)] bg-surface-container-highest/60 px-3 py-1.5">
              <span className="pulse-dot h-2 w-2 rounded-full bg-secondary" />
              <span className="font-headline text-xs font-bold uppercase tracking-[0.26em] text-secondary">
                Workspace Access
              </span>
            </div>

            <p className="mt-6 font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
              Sign In
            </p>
            <h1 className="mt-4 font-headline text-4xl font-bold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              登录后，资料库、归档、通知和设置会进入你的个人空间。
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-8 text-[color:var(--text-muted)] sm:text-base">
              当前项目优先采用 Next.js 16 App Router + Route Handlers + Supabase Auth。
              如果你还没配好 Supabase，本地开发会自动退化为演示登录，方便继续联调前端页面。
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <MetricTile hint="统一查看全部分析记录" label="资料库" value="Library" />
              <MetricTile hint="沉淀已整理的知识资产" label="归档" value="Archive" />
              <MetricTile hint="跟进完成、失败和系统提示" label="通知" value="Inbox" />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
                href="/dashboard"
              >
                先去分析台
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_top,rgba(255,127,0,0.18),transparent_58%)] blur-2xl" />
            <div className="grid gap-4 rounded-[2rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.36)] p-4 sm:p-5">
              <div className="rounded-[1.5rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.48)] p-5">
                <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
                  登录后流程
                </p>
                <div className="mt-4 space-y-4 text-sm leading-7 text-[color:var(--text-muted)]">
                  <div className="flex gap-3">
                    <span className="mt-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                      1
                    </span>
                    <p>输入邮箱并发送登录链接，或在本地开发时进入演示登录。</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                      2
                    </span>
                    <p>进入资料库统一管理分析记录，随时查看详情或归档。</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                      3
                    </span>
                    <p>通过通知和设置页继续维护工作流与个人偏好。</p>
                  </div>
                </div>
              </div>

              <LoginForm />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
