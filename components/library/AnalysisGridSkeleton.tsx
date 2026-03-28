function SkeletonCard() {
  return (
    <div className="glass-card animate-pulse rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-3 w-24 rounded-full bg-[color:rgba(255,127,0,0.18)]" />
          <div className="mt-4 h-6 w-4/5 rounded-full bg-[color:rgba(223,192,175,0.16)]" />
          <div className="mt-2 h-6 w-2/3 rounded-full bg-[color:rgba(223,192,175,0.12)]" />
        </div>
        <div className="h-7 w-20 rounded-full bg-[color:rgba(255,127,0,0.14)]" />
      </div>

      <div className="mt-6 space-y-3">
        <div className="h-4 w-full rounded-full bg-[color:rgba(223,192,175,0.12)]" />
        <div className="h-4 w-[92%] rounded-full bg-[color:rgba(223,192,175,0.1)]" />
        <div className="h-4 w-[72%] rounded-full bg-[color:rgba(223,192,175,0.08)]" />
      </div>

      <div className="mt-5 rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.5)] px-4 py-4">
        <div className="h-3 w-20 rounded-full bg-[color:rgba(223,192,175,0.14)]" />
        <div className="mt-3 h-4 w-full rounded-full bg-[color:rgba(223,192,175,0.1)]" />
        <div className="mt-2 h-4 w-5/6 rounded-full bg-[color:rgba(223,192,175,0.08)]" />
      </div>

      <div className="mt-6 h-4 w-40 rounded-full bg-[color:rgba(223,192,175,0.1)]" />

      <div className="mt-6 flex gap-3">
        <div className="h-11 w-32 rounded-xl bg-[color:rgba(255,127,0,0.16)]" />
        <div className="h-11 w-28 rounded-xl bg-[color:rgba(223,192,175,0.12)]" />
      </div>
    </div>
  );
}

export default function AnalysisGridSkeleton({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
