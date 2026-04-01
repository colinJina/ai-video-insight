"use client";

import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import { buildAuthModalHref, stripAuthModalParams } from "@/lib/auth/modal";
import { sanitizeRedirectPath } from "@/lib/auth/utils";

type AuthModalContextValue = {
  closeAuthModal: () => void;
  isOpen: boolean;
  openAuthModal: (nextPath?: string) => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

function buildCurrentHref(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function useAuthModal() {
  const context = use(AuthModalContext);

  if (!context) {
    throw new Error("useAuthModal must be used within AuthModalProvider.");
  }

  return context;
}

export default function AuthModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(false);

  const currentHref = useMemo(
    () => buildCurrentHref(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );
  const isOpen = searchParams.get("auth") === "login";
  const redirectToPath = sanitizeRedirectPath(searchParams.get("next"));

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        router.replace(stripAuthModalParams(currentHref), { scroll: false });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentHref, isOpen, router]);

  const value = useMemo<AuthModalContextValue>(
    () => ({
      closeAuthModal() {
        router.replace(stripAuthModalParams(currentHref), { scroll: false });
      },
      isOpen,
      openAuthModal(nextPath = pathname) {
        router.push(buildAuthModalHref(currentHref, nextPath), { scroll: false });
      },
    }),
    [currentHref, isOpen, pathname, router],
  );

  return (
    <AuthModalContext value={value}>
      {children}
      {isVisible ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6 sm:px-6">
          <button
            aria-label="Close sign-in modal"
            className="absolute inset-0 bg-[rgba(9,5,2,0.74)] backdrop-blur-md"
            onClick={value.closeAuthModal}
            type="button"
          />

          <div className="amber-glow relative z-[1] w-full max-w-[520px] overflow-hidden rounded-[2rem] border border-[rgba(118,88,60,0.42)] bg-[linear-gradient(180deg,#f7edd8_0%,#f0e1c0_100%)] text-[#2f1b0e] shadow-[0_34px_120px_rgba(0,0,0,0.46)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,182,136,0.25),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.14),transparent_55%)]" />

            <button
              className="absolute right-4 top-4 z-[1] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(82,56,36,0.18)] bg-[rgba(255,255,255,0.46)] text-[rgba(47,27,14,0.72)] transition-colors hover:border-[rgba(82,56,36,0.32)] hover:text-[#2f1b0e]"
              onClick={value.closeAuthModal}
              type="button"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="relative p-4 sm:p-6">
              <div className="rounded-[1.75rem] border border-[rgba(73,46,22,0.12)] bg-[rgba(255,249,239,0.82)] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:px-7 sm:py-8">
                <div className="mb-6 text-center">
                  <p className="font-headline text-[11px] font-bold uppercase tracking-[0.28em] text-[rgba(120,77,42,0.7)]">
                    Welcome Back
                  </p>
                  <h2 className="mt-4 font-headline text-4xl font-bold tracking-[-0.04em] text-[#2f1b0e]">
                    Sign in to continue
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[rgba(66,40,24,0.72)]">
                    Your current page stays in place. Once sign-in completes, we send you right
                    back to the route that asked for access.
                  </p>
                </div>

                <LoginForm redirectToPath={redirectToPath} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AuthModalContext>
  );
}
