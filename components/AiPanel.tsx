const outlineItems = [
  { time: "02:30", text: "SSR 生成逻辑与建筑 BIM 数据集成" },
  { time: "05:15", text: "从 UX 到 SX: 空间体验的智能化迁移" },
  { time: "10:45", text: "自主施工体系带来的伦理与治理挑战" },
];

const tabs = ["摘要", "大纲", "AI 对话"];

export default function AiPanel() {
  return (
    <aside className="glass-panel amber-glow flex h-[calc(100vh-8rem)] min-h-[620px] flex-col overflow-hidden rounded-[1.25rem]">
      <div className="flex border-b border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.6)]">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            className={
              index === 0
                ? "flex-1 border-b-2 border-[color:var(--primary-strong)] bg-[color:rgba(255,127,0,0.05)] py-4 font-headline text-[11px] uppercase tracking-[0.24em] text-primary"
                : "flex-1 py-4 font-headline text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)] transition-colors hover:bg-[color:rgba(255,127,0,0.05)] hover:text-primary"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_15px_rgba(255,127,0,0.6)]" />
              <h3 className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-white">
                核心概念
              </h3>
            </div>
            <p className="border-l border-[color:rgba(88,66,53,0.3)] pl-4 text-sm leading-7 text-[color:var(--text-muted)]">
              演讲提出，建筑不再只是静态容器，而是一种持续演算的空间接口。通过把光照、
              动线、温度和行为模式视作实时数据层，AI 可以成为城市结构的“第二操作系统”。
            </p>
          </section>

          <section>
            <div className="mb-6 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_15px_rgba(255,127,0,0.6)]" />
              <h3 className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-white">
                关键要点
              </h3>
            </div>
            <div className="space-y-4">
              {outlineItems.map((item) => (
                <div key={item.time} className="group flex cursor-pointer gap-4">
                  <span className="pt-1 font-headline text-xs text-[color:var(--primary-strong)]">
                    {item.time}
                  </span>
                  <div className="flex-1 border-l border-[color:rgba(88,66,53,0.2)] py-1 pl-4 text-sm leading-6 text-foreground transition-all group-hover:border-[color:var(--primary-strong)] group-hover:bg-[color:rgba(255,127,0,0.05)]">
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_15px_rgba(255,127,0,0.6)]" />
              <h3 className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-white">
                建议阅读
              </h3>
            </div>
            <div className="group flex cursor-pointer items-center justify-between rounded-xl border border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.4)] p-4 transition-all hover:border-primary/35">
              <div>
                <div className="font-headline text-xs font-bold uppercase tracking-[0.16em] text-white">
                  Neural Urbanism Report
                </div>
                <div className="mt-1 font-headline text-[10px] uppercase tracking-[0.2em] text-[color:rgba(223,192,175,0.5)]">
                  PDF · 4.2 MB
                </div>
              </div>
              <span className="material-symbols-outlined text-[color:rgba(88,66,53,1)] transition-colors group-hover:text-[color:var(--primary-strong)]">
                download
              </span>
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-[color:rgba(88,66,53,0.15)] bg-black/20 p-5 sm:p-6">
        <div className="relative">
          <input
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 pr-12 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
            placeholder="向 AI 提问这段视频的内容..."
            type="text"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--primary-strong)] transition-transform hover:scale-110">
            <span className="material-symbols-outlined">auto_awesome</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
