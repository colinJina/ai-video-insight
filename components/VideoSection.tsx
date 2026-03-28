import Image from "next/image";

const metrics = [
  { icon: "visibility", label: "1.24 万次观看" },
  { icon: "calendar_today", label: "2026 年 3 月 24 日" },
  { icon: "person", label: "Elara Vance 博士" },
];

export default function VideoSection() {
  return (
    <section className="flex flex-col gap-8">
      <div className="glass-panel amber-glow group relative aspect-video overflow-hidden rounded-[1.25rem]">
        <Image
          alt="Architectural concept film frame"
          className="h-full w-full object-cover opacity-55 grayscale transition-all duration-700 group-hover:scale-[1.03] group-hover:grayscale-0"
          src="https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1600&q=80"
          fill
          sizes="(min-width: 1024px) 62vw, 100vw"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-700 group-hover:scale-110">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-black/45 backdrop-blur-md">
            <span className="material-symbols-outlined ml-1 text-5xl text-primary">
              play_circle
            </span>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/30 to-transparent p-5 opacity-100 transition-opacity duration-500 sm:p-6 lg:opacity-0 lg:group-hover:opacity-100">
          <div className="mb-5 h-1 w-full rounded-full bg-[color:rgba(88,66,53,0.3)]">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-[color:var(--primary-strong)] shadow-[0_0_18px_rgba(255,127,0,0.5)]" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary">
                play_arrow
              </span>
              <span className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary">
                skip_next
              </span>
              <span className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary">
                volume_up
              </span>
              <span className="font-headline text-[11px] uppercase tracking-[0.24em] text-[color:rgba(223,192,175,0.72)]">
                04:22 / 12:45
              </span>
            </div>

            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary">
                settings
              </span>
              <span className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary">
                fullscreen
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <span className="mb-3 block font-headline text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
              精选会议
            </span>
            <h1 className="text-glow max-w-4xl font-headline text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              生成式建筑的未来
            </h1>
          </div>

          <button className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-7 py-3 font-headline text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.03]">
            保存到资料库
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-[color:rgba(223,192,175,0.72)]">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary/80">
                {metric.icon}
              </span>
              <span className="font-headline">{metric.label}</span>
            </div>
          ))}
        </div>

        <div className="max-w-3xl border-t border-[color:rgba(88,66,53,0.2)] pt-6 text-[15px] leading-8 text-[color:var(--text-muted)]">
          本次深度讨论聚焦生成式设计如何重塑城市规划和空间认知。我们将沿着参数化建筑、
          BIM 协同与扩散式模型的交叉点，拆解智能系统如何从“生成形态”进一步走向
          “实时感知、实时反馈、实时优化”的新型空间工作流。
        </div>
      </div>
    </section>
  );
}
