export default function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-[1.5rem] border border-[color:rgba(88,66,53,0.18)] p-8 sm:p-10">
      <p className="font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-headline text-2xl font-bold tracking-[-0.04em] text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
