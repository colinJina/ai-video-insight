"use client";

import Link from "next/link";

import PageErrorState from "@/components/app/PageErrorState";
import PageHeader from "@/components/app/PageHeader";

export default function NotificationsError({
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
            href="/notifications"
          >
            Back To Notifications
          </Link>
        </div>
        <PageHeader
          description="Notification data failed to load. You can retry right away."
          eyebrow="Notifications"
          title="Notification center temporarily unavailable"
        />
        <PageErrorState
          description="If the issue continues, inspect the notifications API and the current auth session."
          onRetry={reset}
          title="We could not fetch your notifications"
        />
      </div>
    </main>
  );
}
