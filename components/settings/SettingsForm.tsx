"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import type { AppThemePreference, UserSettings } from "@/lib/app/types";

const GUEST_STORAGE_KEY = "video-ai-guest-settings";
const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80";

type SettingsDraft = {
  nickname: string;
  avatarUrl: string;
  notificationsEnabled: boolean;
  themePreference: AppThemePreference;
};

const THEME_OPTIONS: Array<{
  value: AppThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "跟随系统",
    description: "默认跟随设备主题。",
  },
  {
    value: "light",
    label: "浅色",
    description: "适合长时间阅读与整理。",
  },
  {
    value: "dark",
    label: "深色",
    description: "更适合沉浸式工作环境。",
  },
];

function toDraft(settings: UserSettings | null): SettingsDraft {
  return {
    nickname: settings?.nickname ?? "",
    avatarUrl: settings?.avatarUrl ?? "",
    notificationsEnabled: settings?.notificationsEnabled ?? true,
    themePreference: settings?.themePreference ?? "system",
  };
}

export default function SettingsForm({
  initialSettings,
  authenticated,
}: {
  initialSettings: UserSettings | null;
  authenticated: boolean;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(initialSettings));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const avatarPreview = draft.avatarUrl.trim() || FALLBACK_AVATAR;

  useEffect(() => {
    if (authenticated) {
      return;
    }

    const stored = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<SettingsDraft>;
      setDraft((current) => ({
        nickname: parsed.nickname ?? current.nickname,
        avatarUrl: parsed.avatarUrl ?? current.avatarUrl,
        notificationsEnabled:
          parsed.notificationsEnabled ?? current.notificationsEnabled,
        themePreference: parsed.themePreference ?? current.themePreference,
      }));
    } catch {
      // Ignore invalid localStorage payloads.
    }
  }, [authenticated]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!authenticated) {
      window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(draft));
      setMessage("设置已保存到本地浏览器。登录后会自动切换为云端存储。");
      return;
    }

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        throw new Error("保存设置失败，请稍后重试。");
      }

      startTransition(() => {
        setMessage("设置已保存。");
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存设置失败，请稍后重试。");
    }
  };

  return (
    <form className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]" onSubmit={handleSubmit}>
      <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
        <p className="font-headline text-[11px] font-bold uppercase tracking-[0.26em] text-[color:var(--primary-strong)]">
          Preview
        </p>
        <div className="mt-5 rounded-[1.5rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-5">
          <div className="flex items-center gap-4">
            <div className="amber-glow h-18 w-18 overflow-hidden rounded-full border border-primary/25">
              <Image
                alt="Avatar preview"
                className="h-full w-full object-cover"
                height={72}
                src={avatarPreview}
                width={72}
              />
            </div>
            <div>
              <h2 className="font-headline text-2xl font-bold tracking-[-0.04em] text-white">
                {draft.nickname.trim() || "未设置昵称"}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                {authenticated
                  ? "保存后会作为你的账号资料展示在导航栏和个人空间中。"
                  : "当前为访客模式，保存后会写入本地浏览器。"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(18,9,2,0.52)] px-4 py-4">
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                通知状态
              </p>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                {draft.notificationsEnabled ? "已开启提醒" : "当前关闭提醒"}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(18,9,2,0.52)] px-4 py-4">
              <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                主题偏好
              </p>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                {THEME_OPTIONS.find((option) => option.value === draft.themePreference)?.label}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-[1.5rem] p-6 sm:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-3">
            <span className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
              昵称
            </span>
            <input
              className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(223,192,175,0.42)] focus:border-[color:var(--primary-strong)]"
              onChange={(event) =>
                setDraft((current) => ({ ...current, nickname: event.target.value }))
              }
              placeholder="给自己起一个展示昵称"
              type="text"
              value={draft.nickname}
            />
          </label>

          <label className="space-y-3">
            <span className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
              头像地址
            </span>
            <input
              className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(223,192,175,0.42)] focus:border-[color:var(--primary-strong)]"
              onChange={(event) =>
                setDraft((current) => ({ ...current, avatarUrl: event.target.value }))
              }
              placeholder="https://example.com/avatar.png"
              type="url"
              value={draft.avatarUrl}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl border border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(23,12,3,0.55)] p-4">
            <input
              checked={draft.notificationsEnabled}
              className="mt-1"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notificationsEnabled: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span>
              <span className="block font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-white">
                通知开关
              </span>
              <span className="mt-2 block text-sm leading-7 text-[color:var(--text-muted)]">
                控制分析完成、失败和系统提示是否保留在个人设置中。
              </span>
            </span>
          </label>

          <div className="space-y-3">
            <span className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
              主题偏好
            </span>
            <div className="grid gap-3">
              {THEME_OPTIONS.map((option) => {
                const active = draft.themePreference === option.value;

                return (
                  <button
                    key={option.value}
                    className={
                      active
                        ? "rounded-2xl border border-primary/35 bg-primary/10 px-4 py-4 text-left"
                        : "rounded-2xl border border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(23,12,3,0.55)] px-4 py-4 text-left transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
                    }
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        themePreference: option.value,
                      }))
                    }
                    type="button"
                  >
                    <span className="block font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                      {option.label}
                    </span>
                    <span className="mt-2 block text-sm leading-7 text-[color:var(--text-muted)]">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-7 text-[color:var(--text-muted)]">
            {authenticated
              ? "当前设置会同步保存到 Supabase 数据库。"
              : "未登录状态下，设置会退化保存到 localStorage。"}
          </p>
          <button
            className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            保存设置
          </button>
        </div>
      </section>
    </form>
  );
}
