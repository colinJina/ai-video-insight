"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AppNotification } from "@/lib/app/types";

const TYPE_META = {
  analysis_completed: {
    icon: "task_alt",
    eyebrow: "分析完成",
    tone: "text-[color:#9ee6b7]",
  },
  analysis_failed: {
    icon: "error",
    eyebrow: "分析失败",
    tone: "text-[color:#ffb7b7]",
  },
  system: {
    icon: "tips_and_updates",
    eyebrow: "系统提示",
    tone: "text-primary",
  },
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationsList({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const markAllAsRead = async () => {
    setError(null);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "all" }),
      });

      if (!response.ok) {
        throw new Error("标记通知失败，请稍后重试。");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "标记通知失败，请稍后重试。");
    }
  };

  const markOneAsRead = async (notificationId: string) => {
    setError(null);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "single", notificationId }),
      });

      if (!response.ok) {
        throw new Error("标记通知失败，请稍后重试。");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "标记通知失败，请稍后重试。");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--text-muted)]">
          共 {notifications.length} 条通知，未读会同步显示在导航栏。
        </p>
        <button
          className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            void markAllAsRead();
          }}
          type="button"
        >
          全部标记已读
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-[color:rgba(255,120,120,0.24)] bg-[color:rgba(120,20,20,0.16)] px-4 py-3 text-sm text-[color:#ffb7b7]">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {notifications.map((notification) => {
          const meta = TYPE_META[notification.type];

          return (
            <article
              key={notification.id}
              className={`glass-card rounded-[1.5rem] p-5 sm:p-6 ${
                notification.readAt ? "opacity-75" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <span
                    className={`material-symbols-outlined mt-1 text-2xl ${meta.tone}`}
                  >
                    {meta.icon}
                  </span>
                  <div>
                    <p className={`font-headline text-[11px] font-bold uppercase tracking-[0.28em] ${meta.tone}`}>
                      {meta.eyebrow}
                    </p>
                    <h2 className="mt-2 font-headline text-xl font-bold tracking-[-0.03em] text-white">
                      {notification.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      {notification.body}
                    </p>
                    <p className="mt-4 text-xs text-[color:rgba(223,192,175,0.72)]">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                </div>
                {!notification.readAt ? (
                  <span className="mt-1 h-3 w-3 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_18px_rgba(255,127,0,0.45)]" />
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {notification.relatedAnalysisId ? (
                  <Link
                    className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02]"
                    href={`/analysis/${notification.relatedAnalysisId}`}
                  >
                    查看记录
                  </Link>
                ) : null}
                {!notification.readAt ? (
                  <button
                    className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
                    onClick={() => {
                      void markOneAsRead(notification.id);
                    }}
                    type="button"
                  >
                    标记已读
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
