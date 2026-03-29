"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export default function LoginForm({
  redirectToPath = "/library",
}: {
  redirectToPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitDemoLogin = async () => {
    const response = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message ?? "登录失败，请稍后重试。");
    }

    router.replace(redirectToPath);
    router.refresh();
  };

  const submitSupabaseLogin = async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectToPath)}`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signInError) {
      throw signInError;
    }

    setMessage("登录链接已发送到你的邮箱，请在新标签页完成确认。");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (isSupabaseAuthConfigured()) {
        await submitSupabaseLogin();
      } else {
        await submitDemoLogin();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="glass-card rounded-[1.75rem] p-6 sm:p-8" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.28em] text-[color:var(--primary-strong)]">
            Access
          </p>
          <h2 className="mt-3 font-headline text-2xl font-bold tracking-[-0.04em] text-white">
            用邮箱进入你的知识空间
          </h2>
        </div>
        <div className="rounded-full border border-[color:rgba(255,127,0,0.22)] bg-[color:rgba(255,127,0,0.08)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
          {isSupabaseAuthConfigured() ? "Supabase" : "Demo"}
        </div>
      </div>

      <div className="mt-6 rounded-[1.25rem] border border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(23,12,3,0.55)] p-4">
        <label className="space-y-3">
          <span className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
            邮箱地址
          </span>
          <input
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(18,9,2,0.78)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(223,192,175,0.42)] focus:border-[color:var(--primary-strong)]"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
        </label>

        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          {isSupabaseAuthConfigured()
            ? "已接入 Supabase Auth。提交后会向你的邮箱发送 magic link。"
            : "当前未配置 Supabase 环境变量，开发模式会退化为本地演示登录。"}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.42)] px-4 py-4">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-white">
            登录后解锁
          </p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
            资料库、归档、通知和设置会进入你的专属空间。
          </p>
        </div>
        <div className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.42)] px-4 py-4">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-white">
            当前方式
          </p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
            {isSupabaseAuthConfigured()
              ? "发送邮箱登录链接，点击确认后自动回到你刚才要访问的页面。"
              : "使用输入邮箱创建本地演示会话，方便继续联调界面。"}
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-5 rounded-xl border border-[color:rgba(109,202,144,0.24)] bg-[color:rgba(80,160,110,0.12)] px-4 py-3 text-sm text-[color:#9ee6b7]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-xl border border-[color:rgba(255,120,120,0.24)] bg-[color:rgba(120,20,20,0.16)] px-4 py-3 text-sm text-[color:#ffb7b7]">
          {error}
        </p>
      ) : null}

      <button
        className="mt-6 w-full rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:opacity-60"
        disabled={isSubmitting || !email.trim()}
        type="submit"
      >
        {isSubmitting ? "提交中" : "发送登录链接"}
      </button>
    </form>
  );
}
