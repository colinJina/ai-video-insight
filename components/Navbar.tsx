"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { AppUser } from "@/lib/app/types";
import { sanitizeRedirectPath } from "@/lib/auth/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const desktopLinks = [
  { href: "/dashboard", label: "分析台" },
  { href: "/library", label: "资料库" },
  { href: "/archive", label: "归档" },
];

const mobileLinks = [
  { href: "/dashboard", icon: "space_dashboard", label: "分析" },
  { href: "/library", icon: "video_library", label: "资料库" },
  { href: "/notifications", icon: "notifications", label: "通知" },
  { href: "/settings", icon: "settings", label: "设置" },
];

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80";

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildLoginHref(targetPath: string) {
  return `/login?next=${encodeURIComponent(sanitizeRedirectPath(targetPath))}`;
}

export default function Navbar({
  currentUser = null,
  unreadCount = 0,
}: {
  currentUser?: AppUser | null;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userLabel = useMemo(
    () =>
      currentUser?.nickname?.trim() ||
      currentUser?.email?.split("@")[0] ||
      "访客",
    [currentUser],
  );

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextQuery = String(formData.get("query") ?? "").trim();

    if (!nextQuery) {
      router.push(currentUser ? "/library" : buildLoginHref("/library"));
      return;
    }

    const targetPath = `/library?query=${encodeURIComponent(nextQuery)}`;
    router.push(currentUser ? targetPath : buildLoginHref(targetPath));
  };

  const handleLogout = async () => {
    const logoutTasks: Promise<unknown>[] = [
      fetch("/api/auth/demo-logout", {
        method: "POST",
      }),
    ];

    if (isSupabaseAuthConfigured()) {
      const supabase = createSupabaseBrowserClient();
      logoutTasks.push(supabase.auth.signOut());
    }

    await Promise.allSettled(logoutTasks);
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <nav className="fixed top-0 z-50 h-16 w-full border-b border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(66,50,36,0.58)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-4 font-headline tracking-tight">
          <div className="flex items-center gap-6 lg:gap-8">
            <Link
              className="text-lg font-bold italic tracking-tight text-primary transition-opacity hover:opacity-90 sm:text-xl"
              href="/"
            >
              视频智脑 AI
            </Link>

            <div className="hidden items-center gap-6 text-sm md:flex">
              {desktopLinks.map((item) => {
                const active = isCurrentPath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    className={
                      active
                        ? "border-b-2 border-[color:var(--primary-strong)] pb-1 text-primary"
                        : "text-[color:var(--text-muted)] transition-colors hover:text-primary"
                    }
                    href={
                      !currentUser && item.href !== "/dashboard"
                        ? buildLoginHref(item.href)
                        : item.href
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="hidden flex-1 px-4 lg:block lg:max-w-xl">
            <form
              className="group relative flex items-center border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(29,17,6,0.4)] px-4 py-2 transition-all duration-300 hover:bg-[color:rgba(255,127,0,0.05)]"
              onSubmit={handleSearchSubmit}
            >
              <span className="material-symbols-outlined mr-3 text-lg text-primary/60 transition-colors group-hover:text-primary">
                search
              </span>
              <input
                className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-[color:rgba(88,66,53,0.95)]"
                defaultValue={searchParams.get("query") ?? ""}
                key={`${pathname}:${searchParams.get("query") ?? ""}`}
                name="query"
                placeholder="搜索标题、摘要或视频链接..."
                type="text"
              />
              <button
                className="ml-2 border border-[color:rgba(88,66,53,0.5)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-primary/50 transition-colors hover:border-primary/50 hover:text-primary"
                type="submit"
              >
                搜索
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              className="relative rounded-full p-2 text-[color:var(--text-muted)] transition-all hover:bg-primary/10 hover:text-primary"
              href={currentUser ? "/notifications" : buildLoginHref("/notifications")}
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[color:var(--primary-strong)] px-1.5 py-0.5 text-center font-headline text-[10px] font-bold leading-none text-[color:var(--on-primary)]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              className="rounded-full p-2 text-[color:var(--text-muted)] transition-all hover:bg-primary/10 hover:text-primary"
              href={currentUser ? "/settings" : buildLoginHref("/settings")}
            >
              <span className="material-symbols-outlined">settings</span>
            </Link>

            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    已登录
                  </p>
                  <p className="text-sm text-white">{userLabel}</p>
                </div>
                <div className="amber-glow h-9 w-9 overflow-hidden rounded-full border border-primary/30">
                  <Image
                    alt="User profile avatar"
                    className="h-full w-full object-cover"
                    height={36}
                    src={currentUser.avatarUrl || FALLBACK_AVATAR}
                    width={36}
                  />
                </div>
                <button
                  className="hidden rounded-xl border border-[color:rgba(88,66,53,0.28)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] sm:block"
                  onClick={() => {
                    void handleLogout();
                  }}
                  type="button"
                >
                  退出
                </button>
              </div>
            ) : (
              <Link
                className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.03]"
                href={buildLoginHref(pathname)}
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(29,17,6,0.92)] md:hidden">
        {mobileLinks.map((item) => {
          const active = isCurrentPath(pathname, item.href);

          return (
            <Link
              key={item.href}
              className={
                active
                  ? "flex flex-col items-center gap-1 text-primary"
                  : "flex flex-col items-center gap-1 text-[color:var(--text-muted)]"
              }
              href={
                !currentUser && item.href !== "/dashboard"
                  ? buildLoginHref(item.href)
                  : item.href
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-[8px] uppercase tracking-[0.2em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
