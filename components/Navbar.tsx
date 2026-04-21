"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { AppUser } from "@/lib/app/types";
import { buildAuthModalHref } from "@/lib/auth/modal";
import { sanitizeRedirectPath } from "@/lib/auth/utils";
import { isInlineAvatarSrc } from "@/lib/settings/avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const desktopLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
  { href: "/archive", label: "Archive" },
];

const mobileLinks = [
  { href: "/dashboard", icon: "space_dashboard", label: "Dashboard" },
  { href: "/library", icon: "video_library", label: "Library" },
  { href: "/notifications", icon: "notifications", label: "Inbox" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80";

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NotificationIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.5 17.5H4.5c.8-.8 1.5-1.9 1.8-3.1.3-1.3.2-2.7.2-4.2C6.5 6.3 8.8 4 12 4s5.5 2.3 5.5 6.2c0 1.5-.1 2.9.2 4.2.3 1.2 1 2.3 1.8 3.1H15.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M10.2 19.2c.4.5 1 .8 1.8.8s1.4-.3 1.8-.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M17.4 8.9c.5-1.8.2-3.6-.9-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="18.4" cy="4.4" fill="currentColor" r="1.1" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
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
      "Guest",
    [currentUser],
  );
  const currentHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const buildLoginHref = (targetPath: string) =>
    buildAuthModalHref(currentHref, sanitizeRedirectPath(targetPath));

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
    router.push("/dashboard");
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
              AI Video Insight
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
                placeholder="Search titles, summaries, or source links..."
                type="text"
              />
              <button
                className="ml-2 border border-[color:rgba(88,66,53,0.5)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-primary/50 transition-colors hover:border-primary/50 hover:text-primary"
                type="submit"
              >
                Search
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-[color:var(--text-muted)] transition-all hover:border-[color:rgba(255,127,0,0.18)] hover:bg-primary/10 hover:text-primary"
              href={
                currentUser
                  ? "/notifications"
                  : buildLoginHref("/notifications")
              }
            >
              <NotificationIcon className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[color:var(--primary-strong)] px-1.5 py-0.5 text-center font-headline text-[10px] font-bold leading-none text-[color:var(--on-primary)]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-[color:var(--text-muted)] transition-all hover:border-[color:rgba(255,127,0,0.18)] hover:bg-primary/10 hover:text-primary"
              href={currentUser ? "/settings" : buildLoginHref("/settings")}
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>

            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    Signed In
                  </p>
                  <p className="text-sm text-white">{userLabel}</p>
                </div>
                <div className="amber-glow h-9 w-9 overflow-hidden rounded-full border border-primary/30">
                  <Image
                    alt="User profile avatar"
                    className="h-full w-full object-cover"
                    height={36}
                    src={currentUser.avatarUrl || FALLBACK_AVATAR}
                    unoptimized={isInlineAvatarSrc(currentUser.avatarUrl)}
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
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.03]"
                href={buildLoginHref(pathname)}
              >
                Sign In
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
