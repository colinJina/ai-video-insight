import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import { getOptionalAppSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getOptionalAppSession();

  if (session) {
    redirect("/library");
  }

  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col justify-center gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:px-8">
        <section className="max-w-xl">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
            Sign In
          </p>
          <h1 className="mt-4 font-headline text-4xl font-bold tracking-[-0.05em] text-white sm:text-5xl">
            登录后，资料库、归档、通知和设置会进入你的个人空间。
          </h1>
          <p className="mt-5 text-sm leading-8 text-[color:var(--text-muted)]">
            当前项目优先采用 Next.js 16 App Router + Route Handlers + Supabase Auth。
            如果你还没配好 Supabase，本地开发会自动退化为演示登录，方便继续联调前端页面。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
              href="/dashboard"
            >
              先去分析台
            </Link>
          </div>
        </section>

        <div className="w-full max-w-lg">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
