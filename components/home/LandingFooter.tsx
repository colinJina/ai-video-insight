import Link from "next/link";

import { buildAuthModalHref } from "@/lib/auth/modal";
import RevealOnView from "./RevealOnView";

export default function LandingFooter() {
  const loginHref = buildAuthModalHref("/", "/dashboard");

  return (
    <>
      <RevealOnView as="section" className="relative px-4 py-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-4xl border border-primary/20 bg-[rgba(66,50,36,0.42)] p-12 text-center shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-20">
          <h2 className="font-headline text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
            Ready to redefine your
            <br />
            <span className="text-primary">video learning workflow</span>?
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-(--text-muted)">
            Join creators, researchers, and product teams who turn every video into a searchable, reviewable, and reusable knowledge asset.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4 sm:gap-6">
            <Link
              href={loginHref}
              className="rounded-xl bg-linear-to-br from-primary to-(--primary-strong) px-10 py-4 font-headline text-sm font-bold uppercase tracking-[0.24em] text-(--on-primary) transition-transform hover:scale-[1.03]"
            >
              Start Free
            </Link>
            <a
              href="#overview"
              className="rounded-xl border border-[rgba(88,66,53,0.32)] px-10 py-4 font-headline text-sm font-bold uppercase tracking-[0.24em] text-white transition-colors hover:bg-surface-container-highest"
            >
              Learn More
            </a>
          </div>
        </div>
      </RevealOnView>

      <footer className="border-t border-stone-800/30 bg-[#1d1106] px-8 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-4 md:items-start">
            <div className="font-headline text-lg font-bold text-orange-200">
              AI Video Insight
            </div>
            <p className="text-xs text-stone-500">
              © 2026 AI Video Insight. Crafted with digital sommelier precision.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-8 text-xs text-stone-500">
            <a className="transition-colors hover:text-orange-200" href="#">
              Privacy Policy
            </a>
            <a className="transition-colors hover:text-orange-200" href="#">
              Terms of Service
            </a>
            <a className="transition-colors hover:text-orange-200" href="#">
              Contact Us
            </a>
            <a className="transition-colors hover:text-orange-200" href="#">
              Twitter
            </a>
            <a className="transition-colors hover:text-orange-200" href="#">
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
