export default function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-[color:rgba(88,66,53,0.18)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="font-headline text-[11px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-headline text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          {description}
        </p>
      </div>
      {aside ? <div className="lg:min-w-[260px]">{aside}</div> : null}
    </div>
  );
}
