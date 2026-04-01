"use client";

import Link from "next/link";

import PageErrorState from "@/components/app/PageErrorState";
import PageHeader from "@/components/app/PageHeader";

export default function LibraryError({
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
            href="/library"
          >
            Back To Library
          </Link>
        </div>
        <PageHeader
          description="The library data could not be loaded. You can retry immediately without reopening the page."
          eyebrow="Library"
          title="Library temporarily unavailable"
        />
        <PageErrorState
          description="If the issue continues, check the Supabase configuration or try again later."
          onRetry={reset}
          title="We could not fetch the analysis records"
        />
      </div>
    </main>
  );
}
