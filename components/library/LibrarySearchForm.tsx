"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function LibrarySearchForm({
  initialQuery,
}: {
  initialQuery?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [isPending, startTransition] = useTransition();

  const navigateToQuery = (nextQuery: string) => {
    const trimmedQuery = nextQuery.trim();

    startTransition(() => {
      if (!trimmedQuery) {
        router.push(pathname);
        return;
      }

      router.push(`${pathname}?query=${encodeURIComponent(trimmedQuery)}`);
    });
  };

  return (
    <form
      className="glass-card mt-6 flex flex-col gap-3 rounded-[1.5rem] p-4 sm:flex-row sm:items-center sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        navigateToQuery(query);
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Search library</span>
        <div className="flex items-center gap-3 rounded-2xl border border-[color:rgba(88,66,53,0.24)] bg-[color:rgba(23,12,3,0.6)] px-4 py-3">
          <span className="material-symbols-outlined text-primary/70">search</span>
          <input
            className="w-full border-none bg-transparent text-sm text-white outline-none placeholder:text-[color:rgba(223,192,175,0.55)]"
            onChange={(event) => setQuery(event.target.value)}
            name="query"
            placeholder="Search by title, summary, or source URL"
            type="search"
            value={query}
          />
        </div>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Searching..." : "Search"}
        </button>
        <button
          className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || !query.trim()}
          onClick={() => {
            setQuery("");
            navigateToQuery("");
          }}
          type="button"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
