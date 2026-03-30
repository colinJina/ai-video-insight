import Link from "next/link";
import DashboardShowcase from "./DashboardShowcase";
import HeroTypewriter from "./HeroTypewriter";
import RevealOnView from "./RevealOnView";

export default function HeroSection() {
  return (
    <RevealOnView as="section" className="mx-auto max-w-7xl px-4 pt-32 text-center sm:px-6 lg:px-8">
      <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[rgba(88,66,53,0.18)] bg-surface-container-highest/60 px-3 py-1.5">
        <span className="pulse-dot h-2 w-2 rounded-full bg-secondary" />
        <span className="font-headline text-xs font-bold uppercase tracking-[0.26em] text-secondary">
          AI-Powered Intelligence
        </span>
      </div>

      <h1 className="font-headline text-5xl font-bold tracking-[-0.06em] text-on-surface sm:text-6xl lg:text-8xl">
        把视频转成知识
        <HeroTypewriter />
      </h1>

      <p className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-(--text-muted) sm:text-xl">
        停止在几个小时的会议录像里盲目跳转。AI Video Insight 会在你登录之后立即完成摘要、
        大纲、节点索引与对话式检索，把原本分散的信息浓缩成可执行的知识面板。
      </p>

      <div className="mb-20 mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
        <Link
          href="/dashboard"
          className="w-full rounded-xl bg-linear-to-br from-primary to-(--primary-strong) px-8 py-4 font-headline text-sm font-bold uppercase tracking-[0.22em] text-(--on-primary) shadow-[0_20px_40px_rgba(0,0,0,0.35)] transition-all hover:brightness-110 sm:w-auto"
        >
          免费开始使用
        </Link>
        <a
          href="#overview"
          className="glass-card w-full rounded-xl px-8 py-4 font-headline text-sm font-bold uppercase tracking-[0.22em] text-on-surface transition-colors hover:bg-surface-container-highest sm:w-auto"
        >
          查看产品概览
        </a>
      </div>

      <DashboardShowcase />
    </RevealOnView>
  );
}
