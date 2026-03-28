import Link from "next/link";

export default function LandingFooter() {
  return (
    <>
      <section className="relative px-4 py-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-primary/20 bg-[color:rgba(66,50,36,0.42)] p-12 text-center shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-20">
          <h2 className="font-headline text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
            准备好重新定义你的
            <br />
            <span className="text-primary">视频学习效率</span>了吗？
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-[color:var(--text-muted)]">
            加入内容创作者、研究员与产品团队的工作流，把每一段视频都变成可以搜索、可以回看、可以继续追问的知识资产。
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4 sm:gap-6">
            <Link
              href="/dashboard"
              className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-10 py-4 font-headline text-sm font-bold uppercase tracking-[0.24em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.03]"
            >
              免费开始使用
            </Link>
            <a
              href="#overview"
              className="rounded-xl border border-[color:rgba(88,66,53,0.32)] px-10 py-4 font-headline text-sm font-bold uppercase tracking-[0.24em] text-white transition-colors hover:bg-surface-container-highest"
            >
              了解更多
            </a>
          </div>
        </div>
      </section>

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
