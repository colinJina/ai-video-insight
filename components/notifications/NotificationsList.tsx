"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import MetricTile from "@/components/app/MetricTile";
import type { AppNotification } from "@/lib/app/types";

const TYPE_META = {
  analysis_completed: {
    icon: "task_alt",
    eyebrow: "Analysis Complete",
    tone: "text-[color:#9ee6b7]",
  },
  analysis_failed: {
    icon: "error",
    eyebrow: "Analysis Failed",
    tone: "text-[color:#ffb7b7]",
  },
  system: {
    icon: "tips_and_updates",
    eyebrow: "System Update",
    tone: "text-primary",
  },
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
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
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const completedCount = notifications.filter(
    (item) => item.type === "analysis_completed",
  ).length;
  const failedCount = notifications.filter(
    (item) => item.type === "analysis_failed",
  ).length;

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
        throw new Error("Marking notifications as read failed. Please try again.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Marking notifications as read failed. Please try again.",
      );
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
        throw new Error("Marking the notification as read failed. Please try again.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Marking the notification as read failed. Please try again.",
      );
    }
  };

  const openAnalysis = async (analysisId: string) => {
    setError(null);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "analysis", analysisId }),
      });
    } catch {
      // The detail page will retry this mark-as-read on mount.
    }

    router.push(`/analysis/${analysisId}`);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile hint="Still shown in the navigation badge" label="Unread" value={String(unreadCount)} />
        <MetricTile hint="Completion alerts from finished tasks" label="Completed" value={String(completedCount)} />
        <MetricTile hint="Failures that may need a second look" label="Failed" value={String(failedCount)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--text-muted)]">
          {notifications.length} notifications total. Unread items also surface in the navbar badge.
        </p>
        <button
          className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] disabled:opacity-60"
          disabled={isPending || unreadCount === 0}
          onClick={() => {
            void markAllAsRead();
          }}
          type="button"
        >
          Mark All Read
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
          const relatedAnalysisId = notification.relatedAnalysisId;

          return (
            <article
              key={notification.id}
              className={`glass-card rounded-[1.5rem] p-5 sm:p-6 ${notification.readAt ? "opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <span className={`material-symbols-outlined mt-1 text-2xl ${meta.tone}`}>
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[color:rgba(88,66,53,0.22)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                        {notification.readAt ? "Read" : "Unread"}
                      </span>
                      {relatedAnalysisId ? (
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                          Linked Analysis
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {!notification.readAt ? (
                  <span className="mt-1 h-3 w-3 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_18px_rgba(255,127,0,0.45)]" />
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {relatedAnalysisId ? (
                  <button
                    className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02]"
                    onClick={() => {
                      void openAnalysis(relatedAnalysisId);
                    }}
                    type="button"
                  >
                    View Analysis
                  </button>
                ) : null}
                {!notification.readAt ? (
                  <button
                    className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)]"
                    onClick={() => {
                      void markOneAsRead(notification.id);
                    }}
                    type="button"
                  >
                    Mark Read
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
