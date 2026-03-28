const steps = [
  {
    icon: "link",
    title: "1. 粘贴 URL",
    description: "支持 YouTube、Bilibili、TikTok 与本地录屏，系统会自动识别内容结构。",
  },
  {
    icon: "neurology",
    title: "2. AI 处理",
    description: "语音、字幕、视觉片段与语义节点并行分析，自动生成索引与标签。",
  },
  {
    icon: "insights",
    title: "3. 获取洞察",
    description: "摘要、问答、大纲和进度节点统一聚合，登录后就能立即进入工作流。",
  },
];

const features = [
  {
    title: "自动摘要",
    icon: "auto_awesome_motion",
    accent: "text-primary",
    description: "基于多模态分析生成结构化摘要，把冗长视频浓缩成几屏可读的结论。",
    wide: true,
  },
  {
    title: "AI 对话",
    icon: "forum",
    accent: "text-secondary",
    description: "像和内容本身对话一样提问，快速定位人物、观点与关键时间点。",
    wide: false,
  },
  {
    title: "交互式大纲",
    icon: "list_alt",
    accent: "text-primary",
    description: "自动标注时间节点，点击任意大纲即可跳转到视频的对应时刻。",
    wide: false,
  },
];

export default function OverviewSection() {
  return (
    <>
      <section id="overview" className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-headline text-4xl font-bold tracking-[-0.04em] text-white">
            极简三步，即刻洞察
          </h2>
          <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-primary/60" />
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {steps.map((step, index) => (
            <div key={step.title} className="relative text-center">
              <div className="obsidian-shadow glass-card relative mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full transition-transform duration-300 hover:scale-110">
                <span className="material-symbols-outlined text-4xl text-primary">
                  {step.icon}
                </span>
              </div>
              <h3 className="font-headline text-xl font-bold text-white">
                {step.title}
              </h3>
              <p className="mt-4 leading-7 text-[color:var(--text-muted)]">
                {step.description}
              </p>
              {index < steps.length - 1 ? (
                <div className="absolute right-[-2rem] top-12 hidden h-px w-16 bg-[color:rgba(88,66,53,0.35)] md:block" />
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface-container-low/50 py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-headline text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
                覆盖从浏览到登录后的整段智能体验
              </h2>
              <p className="mt-6 text-lg leading-8 text-[color:var(--text-muted)]">
                首页负责把能力讲清楚，登录后负责把知识真正交到你手里。视觉上我们保持同一套 Amber Synth 语言，
                让用户从入场到工作台的感受是连续的。
              </p>
            </div>
            <div className="pb-2">
              <span className="border-b-2 border-primary pb-2 font-headline text-sm font-bold uppercase tracking-[0.24em] text-primary">
                核心能力
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={
                  feature.wide
                    ? "glass-card obsidian-shadow rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60 md:col-span-2"
                    : "glass-card obsidian-shadow rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60"
                }
              >
                <span className={`material-symbols-outlined mb-6 text-3xl ${feature.accent}`}>
                  {feature.icon}
                </span>
                <h3 className="font-headline text-2xl font-bold text-white">
                  {feature.title}
                </h3>
                <p className="mt-4 leading-7 text-[color:var(--text-muted)]">
                  {feature.description}
                </p>

                {feature.wide ? (
                  <div className="mt-8 rounded-[1rem] border border-[color:rgba(88,66,53,0.14)] bg-surface-container-low p-4">
                    <div className="space-y-3">
                      <div className="h-3 w-full rounded bg-primary/20" />
                      <div className="h-3 w-4/5 rounded bg-white/8" />
                      <div className="h-3 w-full rounded bg-white/8" />
                      <div className="h-3 w-3/4 rounded bg-white/8" />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            <div className="glass-card obsidian-shadow relative overflow-hidden rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60 md:col-span-2">
              <div className="relative z-10 grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <div>
                  <span className="material-symbols-outlined mb-6 text-3xl text-primary">
                    devices
                  </span>
                  <h3 className="font-headline text-2xl font-bold text-white">
                    多平台输入
                  </h3>
                  <p className="mt-4 leading-7 text-[color:var(--text-muted)]">
                    无缝接入 YouTube、Bilibili、TikTok、Zoom 录屏和本地素材，保持统一的知识入口。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 opacity-30 grayscale">
                  <div className="aspect-square rounded-lg bg-secondary" />
                  <div className="aspect-square rounded-lg bg-primary" />
                  <div className="aspect-square rounded-lg bg-surface-container-highest" />
                  <div className="aspect-square rounded-lg bg-[color:rgba(88,66,53,0.9)]" />
                </div>
              </div>
              <div className="absolute inset-y-0 right-0 w-1/3 bg-primary/5 blur-3xl" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
