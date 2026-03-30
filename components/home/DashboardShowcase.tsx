"use client";

import Image from "next/image";
import Link from "next/link";
import HeroTypewriter from "./HeroTypewriter";
import {
  type CSSProperties,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";

type PointerState = {
  x: number;
  y: number;
};

const analysisItems = [
  { icon: "auto_awesome", label: "AI 分析进度", value: "84%" },
  { icon: "segment", label: "可交互时间轴", value: "Live" },
];

const VIDEO_URL_PHRASES = [
  "https://youtube.com/watch?v=ai-video-insight...",
];

export default function DashboardShowcase() {
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const applyPointer = useEffectEvent((pointer: PointerState) => {
    const element = showcaseRef.current;

    if (!element) {
      return;
    }

    element.style.setProperty("--parallax-x", `${pointer.x}px`);
    element.style.setProperty("--parallax-y", `${pointer.y}px`);
  });

  useEffect(() => {
    const element = showcaseRef.current;

    if (!element) {
      return;
    }

    const resetPointer = () => applyPointer({ x: 0, y: 0 });

    const updatePointer = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        applyPointer({
          x: normalizedX * 28,
          y: normalizedY * 24,
        });
      });
    };

    element.addEventListener("pointermove", updatePointer);
    element.addEventListener("pointerleave", resetPointer);
    resetPointer();

    return () => {
      element.removeEventListener("pointermove", updatePointer);
      element.removeEventListener("pointerleave", resetPointer);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={showcaseRef}
      className="dashboard-entrance relative mx-auto max-w-6xl [--parallax-x:0px] [--parallax-y:0px]"
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/20 blur-[100px] opacity-60 transition-all duration-700" />

      <div className="glass-card obsidian-shadow relative overflow-hidden rounded-[1.75rem] border border-[rgba(88,66,53,0.28)] p-4 md:p-8">
        <div className="absolute inset-x-[16%] top-0 h-40 bg-linear-to-b from-primary/10 to-transparent blur-3xl" />

        <div className="relative mb-6 flex items-center gap-4 border-b border-[rgba(88,66,53,0.12)] pb-4">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/50" />
            <div className="h-3 w-3 rounded-full bg-amber-500/50" />
            <div className="h-3 w-3 rounded-full bg-green-500/50" />
          </div>
          <HeroTypewriter
            className="min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-container-low px-4 py-1.5 font-mono text-xs text-[rgba(223,192,175,0.75)]"
            deleteDelay={22}
            locale="en-US"
            pauseDelay={1800}
            phrases={VIDEO_URL_PHRASES}
            restartDelay={420}
            typeDelay={30}
          />
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div
            className="parallax-layer col-span-12 aspect-video overflow-hidden rounded-[1.2rem] bg-black/40 md:col-span-8"
            style={
              {
                "--depth-x": "0.42",
                "--depth-y": "0.48",
              } as CSSProperties
            }
          >
            <Image
              alt="AI dashboard visual"
              className="h-full w-full scale-105 object-cover opacity-60 grayscale transition-all duration-700 hover:grayscale-0"
              src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80"
              fill
              sizes="(min-width: 768px) 66vw, 100vw"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-7xl text-primary/80">
                play_circle
              </span>
            </div>
          </div>

          <div
            className="parallax-layer col-span-12 space-y-4 md:col-span-4"
            style={
              {
                "--depth-x": "0.7",
                "--depth-y": "0.78",
              } as CSSProperties
            }
          >
            <div className="h-8 w-3/4 rounded-lg bg-surface-container-highest/50" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded-md bg-surface-container-low" />
              <div className="h-4 w-5/6 rounded-md bg-surface-container-low" />
              <div className="h-4 w-4/6 rounded-md bg-surface-container-low" />
            </div>

            <div className="space-y-3 pt-4">
              {analysisItems.map((item, index) => (
                <div
                  key={item.label}
                  className={
                    index === 0
                      ? "glass-card flex items-center gap-3 rounded-xl border border-primary/20 p-3"
                      : "glass-card node-signal flex items-center gap-3 rounded-xl p-3"
                  }
                >
                  <span
                    className={
                      index === 0
                        ? "material-symbols-outlined text-sm text-primary"
                        : "material-symbols-outlined text-sm text-secondary"
                    }
                  >
                    {item.icon}
                  </span>
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <span
                      className={
                        index === 0
                          ? "text-xs font-bold text-on-surface"
                          : "text-xs text-(--text-muted)"
                      }
                    >
                      {item.label}
                    </span>
                    <span
                      className={
                        index === 0
                          ? "font-headline text-[11px] uppercase tracking-[0.22em] text-primary"
                          : "node-signal-badge rounded-full border border-secondary/30 px-2 py-1 font-headline text-[10px] uppercase tracking-[0.22em] text-secondary"
                      }
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="parallax-layer mt-8 grid gap-4 rounded-[1.3rem] border border-[rgba(88,66,53,0.16)] bg-[rgba(14,9,5,0.58)] p-5 md:grid-cols-[1.4fr_0.9fr]"
          style={
            {
              "--depth-x": "0.25",
              "--depth-y": "0.3",
            } as CSSProperties
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-headline text-[10px] uppercase tracking-[0.28em] text-primary">
                  Login Preview
                </p>
                <h3 className="mt-2 font-headline text-2xl font-bold tracking-[-0.04em] text-white">
                  登录后立刻进入知识工作台
                </h3>
              </div>
              <div className="hidden rounded-full border border-primary/20 px-3 py-1 font-headline text-[10px] uppercase tracking-[0.24em] text-primary md:block">
                Real-Time Sync
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[rgba(88,66,53,0.2)] bg-surface-container-low p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-(--text-muted)">
                  Workspaces
                </p>
                <p className="mt-3 font-headline text-xl font-semibold text-white">
                  18 个视频项目
                </p>
              </div>
              <div className="rounded-xl border border-[rgba(88,66,53,0.2)] bg-surface-container-low p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-(--text-muted)">
                  AI Progress
                </p>
                <div className="mt-4 h-2 rounded-full bg-[rgba(88,66,53,0.32)]">
                  <div className="progress-sheen h-full w-[84%] rounded-full bg-linear-to-r from-primary to-(--primary-strong)" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.1rem] border border-[rgba(88,66,53,0.16)] bg-[rgba(34,20,10,0.78)] p-5">
            <p className="font-headline text-[10px] uppercase tracking-[0.28em] text-secondary">
              Account Access
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[rgba(88,66,53,0.22)] bg-black/20 px-4 py-3 text-sm text-(--text-muted)">
                you@workspace.ai
              </div>
              <div className="rounded-xl border border-[rgba(88,66,53,0.22)] bg-black/20 px-4 py-3 text-sm tracking-[0.22em] text-[rgba(223,192,175,0.45)]">
                ••••••••••••
              </div>
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center rounded-xl bg-linear-to-br from-primary to-(--primary-strong) px-5 py-3 font-headline text-xs font-bold uppercase tracking-[0.22em] text-(--on-primary) transition-transform hover:scale-[1.02]"
              >
                登录并进入工作台
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
