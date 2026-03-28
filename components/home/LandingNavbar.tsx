import Link from "next/link";

const navItems = ["Product", "Features", "Pricing", "About"];

export default function LandingNavbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-stone-950/60 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link
          href="/"
          className="font-headline text-xl font-bold tracking-[-0.04em] text-orange-200 sm:text-2xl"
        >
          AI Video Insight
        </Link>

        <div className="hidden items-center gap-8 font-headline text-sm font-bold uppercase tracking-[0.18em] md:flex">
          {navItems.map((item, index) => (
            <a
              key={item}
              className={
                index === 0
                  ? "border-b-2 border-orange-400 pb-1 text-orange-400"
                  : "text-stone-400 transition-colors hover:text-stone-200"
              }
              href="#"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden rounded-lg border border-[color:rgba(166,139,123,0.25)] px-4 py-2 font-headline text-sm font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)] transition-colors hover:text-white sm:inline-flex"
          >
            登录工作台
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-5 py-2.5 font-headline text-sm font-bold uppercase tracking-[0.16em] text-[color:var(--on-primary)] shadow-[0_20px_40px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.03]"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
