"use client";

import { useEffect, useState, useTransition } from "react";

import type { AppThemePreference, UserSettings } from "@/lib/app/types";

const GUEST_STORAGE_KEY = "video-ai-guest-settings";

type SettingsDraft = {
  nickname: string;
  avatarUrl: string;
  notificationsEnabled: boolean;
  themePreference: AppThemePreference;
};

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
    <form className="glass-card rounded-[1.5rem] p-6 sm:p-8" onSubmit={handleSubmit}>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-3">
          <span className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
            昵称
          </span>
          <input
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
            onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
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
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
            onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
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

        <label className="space-y-3">
          <span className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
            主题偏好
          </span>
          <select
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-[color:var(--primary-strong)]"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                themePreference: event.target.value as AppThemePreference,
              }))
            }
            value={draft.themePreference}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
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
    </form>
  );
}
