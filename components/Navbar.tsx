import Image from "next/image";

const navItems = [
  { label: "总览", active: false },
  { label: "分析台", active: true },
  { label: "资料库", active: false },
  { label: "归档", active: false },
];

const mobileItems = [
  { icon: "grid_view", label: "首页", active: true },
  { icon: "explore", label: "发现", active: false },
  { icon: "video_library", label: "资料", active: false },
];

export default function Navbar() {
  return (
    <>
      <nav className="fixed top-0 z-50 h-16 w-full border-b border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(66,50,36,0.58)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-4 font-headline tracking-tight">
          <div className="flex items-center gap-6 lg:gap-8">
            <span className="text-lg font-bold italic tracking-tight text-primary sm:text-xl">
              视频智脑 AI
            </span>

            <div className="hidden items-center gap-6 text-sm md:flex">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  className={
                    item.active
                      ? "border-b-2 border-[color:var(--primary-strong)] pb-1 text-primary"
                      : "text-[color:var(--text-muted)] transition-colors hover:text-primary"
                  }
                  href="#"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <div className="hidden flex-1 px-4 lg:block lg:max-w-xl">
            <div className="group relative flex items-center border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(29,17,6,0.4)] px-4 py-2 transition-all duration-300 hover:bg-[color:rgba(255,127,0,0.05)]">
              <span className="material-symbols-outlined mr-3 text-lg text-primary/60 transition-colors group-hover:text-primary">
                search
              </span>
              <input
                className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-[color:rgba(88,66,53,0.95)]"
                placeholder="分析视频 URL 或检索知识库..."
                type="text"
              />
              <span className="ml-2 border border-[color:rgba(88,66,53,0.5)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-primary/50">
                Ctrl K
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button className="rounded-full p-2 text-[color:var(--text-muted)] transition-all hover:bg-primary/10 hover:text-primary">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="rounded-full p-2 text-[color:var(--text-muted)] transition-all hover:bg-primary/10 hover:text-primary">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="amber-glow h-9 w-9 overflow-hidden rounded-full border border-primary/30">
              <Image
                alt="User profile avatar"
                className="h-full w-full object-cover"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80"
                width={36}
                height={36}
              />
            </div>
          </div>
        </div>
      </nav>

      <div className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(29,17,6,0.92)] md:hidden">
        {mobileItems.map((item) => (
          <button
            key={item.label}
            className={
              item.active
                ? "flex flex-col items-center gap-1 text-primary"
                : "flex flex-col items-center gap-1 text-[color:var(--text-muted)]"
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-[8px] uppercase tracking-[0.2em]">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
