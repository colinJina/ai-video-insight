"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const OAUTH_PROVIDERS = [
  {
    id: "google",
    label: "Continue with Google",
    icon: "G",
    iconClassName: "bg-[linear-gradient(135deg,#4285F4,#EA4335_45%,#FBBC05_70%,#34A853)] text-white",
  },
  {
    id: "github",
    label: "Continue with GitHub",
    icon: "GH",
    iconClassName: "bg-[#2f1b0e] text-[#f7edd8]",
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]["id"];

export default function LoginForm({
  redirectToPath = "/library",
}: {
  redirectToPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<OAuthProvider | "demo" | null>(
    null,
  );

  const submitDemoLogin = async () => {
    const response = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim() || "demo@example.com",
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message ?? "Sign-in failed. Please try again.");
    }

    router.replace(redirectToPath);
    router.refresh();
  };

  const submitSupabaseLogin = async (provider: OAuthProvider) => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectToPath)}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      throw signInError;
    }
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    setActiveProvider(provider);

    try {
      await submitSupabaseLogin(provider);
      setMessage("Redirecting to the provider. Finish the authorization flow to return here.");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Sign-in failed. Please try again.",
      );
      setIsSubmitting(false);
      setActiveProvider(null);
    }
  };

  const handleEmailSubmit = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    setActiveProvider("demo");

    try {
      await submitDemoLogin();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Sign-in failed. Please try again.",
      );
      setIsSubmitting(false);
      setActiveProvider(null);
    }
  };

  const authConfigured = isSupabaseAuthConfigured();

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="space-y-3">
        {authConfigured ? (
          OAUTH_PROVIDERS.map((provider) => {
            const isActive = activeProvider === provider.id;

            return (
              <button
                key={provider.id}
                className={`flex w-full items-center gap-4 rounded-none border px-5 py-4 text-left transition-all ${
                  provider.id === "google"
                    ? "border-[rgba(63,40,24,0.82)] bg-[#5e4c3f] text-[#fff8ee] hover:bg-[#534437]"
                    : "border-[rgba(63,40,24,0.36)] bg-[rgba(255,252,246,0.86)] text-[#2f1b0e] hover:bg-[rgba(250,244,232,0.96)]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                disabled={isSubmitting}
                onClick={() => void handleOAuthLogin(provider.id)}
                type="button"
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${provider.iconClassName}`}
                >
                  {provider.icon}
                </span>
                <span className="font-body text-[15px] font-medium tracking-[-0.01em]">
                  {isActive ? "Opening provider..." : provider.label}
                </span>
              </button>
            );
          })
        ) : null}
      </div>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-[rgba(120,77,42,0.22)]" />
        <span className="text-sm text-[rgba(66,40,24,0.62)]">
          {authConfigured ? "or use demo email" : "use email"}
        </span>
        <div className="h-px flex-1 bg-[rgba(120,77,42,0.22)]" />
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">Email address</span>
          <input
            className="w-full rounded-none border border-[rgba(63,40,24,0.28)] bg-[rgba(255,252,246,0.92)] px-4 py-4 text-[15px] text-[#2f1b0e] outline-none transition-colors placeholder:text-[rgba(120,77,42,0.58)] focus:border-[rgba(191,114,31,0.7)]"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={authConfigured ? "Email is used for demo sign-in only" : "your@email.com"}
            type="email"
            value={email}
          />
        </label>

        <button
          className="w-full rounded-none bg-[linear-gradient(180deg,#c37723_0%,#b56716_100%)] px-5 py-4 font-headline text-sm font-bold uppercase tracking-[0.18em] text-[#fff8ee] shadow-[0_8px_20px_rgba(126,72,14,0.22)] transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || (!email.trim() && !authConfigured)}
          onClick={() => void handleEmailSubmit()}
          type="button"
        >
          {activeProvider === "demo" ? "Signing In..." : "Send Verification Code"}
        </button>
      </div>

      <p className="mt-5 text-center text-sm leading-7 text-[rgba(66,40,24,0.66)]">
        By continuing you agree to our Terms & Privacy.
      </p>

      {authConfigured ? (
        <p className="mt-3 text-center text-xs leading-6 text-[rgba(66,40,24,0.56)]">
          Google and GitHub keep using the existing Supabase session flow. The email field above
          remains a local demo fallback for development.
        </p>
      ) : null}

      {message ? (
        <p className="mt-4 border border-[rgba(109,202,144,0.32)] bg-[rgba(80,160,110,0.12)] px-4 py-3 text-sm text-[#2d6c41]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 border border-[rgba(186,66,66,0.22)] bg-[rgba(166,48,48,0.1)] px-4 py-3 text-sm text-[#8f2f2f]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
