"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export default function LoginForm() {
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

    router.replace("/library");
    router.refresh();
  };

  const submitSupabaseLogin = async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
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
    <form className="glass-card rounded-[1.5rem] p-6 sm:p-8" onSubmit={handleSubmit}>
      <label className="space-y-3">
        <span className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
          邮箱登录
        </span>
        <input
          className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          type="email"
          value={email}
        />
      </label>

      <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
        {isSupabaseAuthConfigured()
          ? "已接入 Supabase Auth。提交后会向邮箱发送 magic link。"
          : "当前未配置 Supabase 环境变量，开发模式会退化为本地演示登录。"}
      </p>

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
