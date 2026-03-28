export default function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.48)] px-4 py-4">
      <p className="font-headline text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
        {label}
      </p>
      <p className="mt-3 font-headline text-2xl font-bold tracking-[-0.04em] text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
