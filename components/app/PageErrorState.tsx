"use client";

export default function PageErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="glass-card rounded-[1.5rem] border border-[color:rgba(255,120,120,0.22)] p-8 sm:p-10">
      <p className="font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:#ffb7b7]">
        Error
      </p>
      <h2 className="mt-4 font-headline text-2xl font-bold tracking-[-0.04em] text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
        {description}
      </p>
      <button
        className="mt-6 rounded-xl border border-[color:rgba(255,120,120,0.25)] px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,120,120,0.08)]"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}
