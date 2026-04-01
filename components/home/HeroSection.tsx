import Link from "next/link";

import { buildAuthModalHref } from "@/lib/auth/modal";
import DashboardShowcase from "./DashboardShowcase";
import HeroTypewriter from "./HeroTypewriter";
import RevealOnView from "./RevealOnView";

export default function HeroSection() {
  const loginHref = buildAuthModalHref("/", "/dashboard");

  return (
    <RevealOnView
      as="section"
      className="mx-auto max-w-7xl px-4 pt-32 text-center sm:px-6 lg:px-8"
    >
      <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[rgba(88,66,53,0.18)] bg-surface-container-highest/60 px-3 py-1.5">
        <span className="pulse-dot h-2 w-2 rounded-full bg-secondary" />
        <span className="font-headline text-xs font-bold uppercase tracking-[0.26em] text-secondary">
          AI-Powered Intelligence
        </span>
      </div>

      <h1 className="font-headline text-5xl font-bold tracking-[-0.06em] text-on-surface sm:text-6xl lg:text-8xl">
        Turn long-form video into
        <HeroTypewriter />
      </h1>

      <p className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-(--text-muted) sm:text-xl">
        Stop skimming through hours of recordings. AI Video Insight signs you in, builds the summary, outline, cue index, and conversational context, then condenses scattered video information into an actionable knowledge surface.
      </p>

      <div className="mb-20 mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
        <Link
          className="w-full rounded-xl bg-linear-to-br from-primary to-(--primary-strong) px-8 py-4 font-headline text-sm font-bold uppercase tracking-[0.22em] text-(--on-primary) shadow-[0_20px_40px_rgba(0,0,0,0.35)] transition-all hover:brightness-110 sm:w-auto"
          href={loginHref}
        >
          Start With Sign-In
        </Link>
        <a
          className="glass-card w-full rounded-xl px-8 py-4 font-headline text-sm font-bold uppercase tracking-[0.22em] text-on-surface transition-colors hover:bg-surface-container-highest sm:w-auto"
          href="#overview"
        >
          Explore Overview
        </a>
      </div>

      <DashboardShowcase />
    </RevealOnView>
  );
}
