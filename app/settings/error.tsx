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
            Back To Settings
          </Link>
        </div>
        <PageHeader
          description="Settings data failed to load. You can retry immediately."
          eyebrow="Settings"
          title="Settings temporarily unavailable"
        />
        <PageErrorState
          description="If the issue continues, inspect the settings API and the current account data."
          onRetry={reset}
          title="We could not load your settings"
        />
      </div>
    </main>
  );
}
