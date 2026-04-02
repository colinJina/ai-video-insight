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
    icon: <GitHubIcon className="h-4 w-4 fill-current" />,
    iconClassName: "bg-[#2f1b0e] text-[#f7edd8]",
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]["id"];

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 -0.5 25 25"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m12.301 0h.093c2.242 0 4.34.613 6.137 1.68l-.055-.031c1.871 1.094 3.386 2.609 4.449 4.422l.031.058c1.04 1.769 1.654 3.896 1.654 6.166 0 5.406-3.483 10-8.327 11.658l-.087.026c-.063.02-.135.031-.209.031-.162 0-.312-.054-.433-.144l.002.001c-.128-.115-.208-.281-.208-.466 0-.005 0-.01 0-.014v.001q0-.048.008-1.226t.008-2.154c.007-.075.011-.161.011-.249 0-.792-.323-1.508-.844-2.025.618-.061 1.176-.163 1.718-.305l-.076.017c.573-.16 1.073-.373 1.537-.642l-.031.017c.508-.28.938-.636 1.292-1.058l.006-.007c.372-.476.663-1.036.84-1.645l.009-.035c.209-.683.329-1.468.329-2.281 0-.045 0-.091-.001-.136v.007c0-.022.001-.047.001-.072 0-1.248-.482-2.383-1.269-3.23l.003.003c.168-.44.265-.948.265-1.479 0-.649-.145-1.263-.404-1.814l.011.026c-.115-.022-.246-.035-.381-.035-.334 0-.649.078-.929.216l.012-.005c-.568.21-1.054.448-1.512.726l.038-.022-.609.384c-.922-.264-1.981-.416-3.075-.416s-2.153.152-3.157.436l.081-.02q-.256-.176-.681-.433c-.373-.214-.814-.421-1.272-.595l-.066-.022c-.293-.154-.64-.244-1.009-.244-.124 0-.246.01-.364.03l.013-.002c-.248.524-.393 1.139-.393 1.788 0 .531.097 1.04.275 1.509l-.01-.029c-.785.844-1.266 1.979-1.266 3.227 0 .025 0 .051.001.076v-.004c-.001.039-.001.084-.001.13 0 .809.12 1.591.344 2.327l-.015-.057c.189.643.476 1.202.85 1.693l-.009-.013c.354.435.782.793 1.267 1.062l.022.011c.432.252.933.465 1.46.614l.046.011c.466.125 1.024.227 1.595.284l.046.004c-.431.428-.718 1-.784 1.638l-.001.012c-.207.101-.448.183-.699.236l-.021.004c-.256.051-.549.08-.85.08-.022 0-.044 0-.066 0h.003c-.394-.008-.756-.136-1.055-.348l.006.004c-.371-.259-.671-.595-.881-.986l-.007-.015c-.198-.336-.459-.614-.768-.827l-.009-.006c-.225-.169-.49-.301-.776-.38l-.016-.004-.32-.048c-.023-.002-.05-.003-.077-.003-.14 0-.273.028-.394.077l.007-.003q-.128.072-.08.184c.039.086.087.16.145.225l-.001-.001c.061.072.13.135.205.19l.003.002.112.08c.283.148.516.354.693.603l.004.006c.191.237.359.505.494.792l.01.024.16.368c.135.402.38.738.7.981l.005.004c.3.234.662.402 1.057.478l.016.002c.33.064.714.104 1.106.112h.007c.045.002.097.002.15.002.261 0 .517-.021.767-.062l-.027.004.368-.064q0 .609.008 1.418t.008.873v.014c0 .185-.08.351-.208.466h-.001c-.119.089-.268.143-.431.143-.075 0-.147-.011-.214-.032l.005.001c-4.929-1.689-8.409-6.283-8.409-11.69 0-2.268.612-4.393 1.681-6.219l-.032.058c1.094-1.871 2.609-3.386 4.422-4.449l.058-.031c1.739-1.034 3.835-1.645 6.073-1.645h.098-.005zm-7.64 17.666q.048-.112-.112-.192-.16-.048-.208.032-.048.112.112.192.144.096.208-.032zm.497.545q.112-.08-.032-.256-.16-.144-.256-.048-.112.08.032.256.159.157.256.047zm.48.72q.144-.112 0-.304-.128-.208-.272-.096-.144.08 0 .288t.272.112zm.672.673q.128-.128-.064-.304-.192-.192-.32-.048-.144.128.064.304.192.192.32.044zm.913.4q.048-.176-.208-.256-.24-.064-.304.112t.208.24q.24.097.304-.096zm1.009.08q0-.208-.272-.176-.256 0-.256.176 0 .208.272.176.256.001.256-.175zm.929-.16q-.032-.176-.288-.144-.256.048-.224.24t.288.128.225-.224z" />
    </svg>
  );
}

export default function LoginForm({
  redirectToPath = "/library",
}: {
  redirectToPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<OAuthProvider | "email" | "demo" | null>(
    null,
  );
  const [isAwaitingEmailCode, setIsAwaitingEmailCode] = useState(false);

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

  const submitEmailCode = async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectToPath)}`;
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      throw new Error("Please enter your email address first.");
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signInError) {
      throw signInError;
    }
  };

  const verifyEmailCode = async () => {
    const supabase = createSupabaseBrowserClient();
    const normalizedEmail = email.trim();
    const normalizedCode = verificationCode.trim();

    if (!normalizedEmail) {
      throw new Error("Please enter your email address first.");
    }

    if (!/^\d{8}$/.test(normalizedCode)) {
      throw new Error("Please enter the 8-digit verification code.");
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (verifyError) {
      throw verifyError;
    }

    router.replace(redirectToPath);
    router.refresh();
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
    setActiveProvider(authConfigured ? "email" : "demo");

    try {
      if (authConfigured) {
        if (isAwaitingEmailCode) {
          await verifyEmailCode();
          return;
        }

        await submitEmailCode();
        setIsAwaitingEmailCode(true);
        setMessage("We sent an 8-digit verification code to your email. Enter it below to finish signing in.");
        setIsSubmitting(false);
        setActiveProvider(null);
        return;
      }

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
          {authConfigured ? "or use email code" : "use email"}
        </span>
        <div className="h-px flex-1 bg-[rgba(120,77,42,0.22)]" />
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">Email address</span>
          <input
            className="w-full rounded-none border border-[rgba(63,40,24,0.28)] bg-[rgba(255,252,246,0.92)] px-4 py-4 text-[15px] text-[#2f1b0e] outline-none transition-colors placeholder:text-[rgba(120,77,42,0.58)] focus:border-[rgba(191,114,31,0.7)]"
            onChange={(event) => {
              setEmail(event.target.value);
              if (authConfigured) {
                setVerificationCode("");
                setIsAwaitingEmailCode(false);
              }
            }}
            placeholder="your@email.com"
            type="email"
            value={email}
          />
        </label>

        {authConfigured && isAwaitingEmailCode ? (
          <label className="block">
            <span className="sr-only">Verification code</span>
            <input
              autoComplete="one-time-code"
              className="w-full rounded-none border border-[rgba(63,40,24,0.28)] bg-[rgba(255,252,246,0.92)] px-4 py-4 text-[15px] tracking-[0.32em] text-[#2f1b0e] outline-none transition-colors placeholder:text-[rgba(120,77,42,0.58)] focus:border-[rgba(191,114,31,0.7)]"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="12345678"
              type="text"
              value={verificationCode}
            />
          </label>
        ) : null}

        <button
          className="w-full rounded-none bg-[linear-gradient(180deg,#c37723_0%,#b56716_100%)] px-5 py-4 font-headline text-sm font-bold uppercase tracking-[0.18em] text-[#fff8ee] shadow-[0_8px_20px_rgba(126,72,14,0.22)] transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={
            isSubmitting ||
            !email.trim() ||
            (authConfigured && isAwaitingEmailCode && verificationCode.trim().length !== 8)
          }
          onClick={() => void handleEmailSubmit()}
          type="button"
        >
          {activeProvider === "demo"
            ? "Signing In..."
            : activeProvider === "email"
              ? isAwaitingEmailCode
                ? "Verifying..."
                : "Sending Code..."
              : isAwaitingEmailCode
                ? "Verify Code"
                : "Send Verification Code"}
        </button>

        {authConfigured && isAwaitingEmailCode ? (
          <button
            className="w-full rounded-none border border-[rgba(63,40,24,0.28)] bg-[rgba(255,252,246,0.86)] px-5 py-4 font-body text-sm font-semibold uppercase tracking-[0.14em] text-[#5c3a21] transition-colors hover:bg-[rgba(250,244,232,0.96)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !email.trim()}
            onClick={() => {
              setVerificationCode("");
              setIsAwaitingEmailCode(false);
              setMessage("You can request a new 8-digit code for this email.");
              setError(null);
              setIsSubmitting(false);
              setActiveProvider(null);
            }}
            type="button"
          >
            Change Email
          </button>
        ) : null}
      </div>

      <p className="mt-5 text-center text-sm leading-7 text-[rgba(66,40,24,0.66)]">
        By continuing you agree to our Terms & Privacy.
      </p>

      {authConfigured ? (
        <p className="mt-3 text-center text-xs leading-6 text-[rgba(66,40,24,0.56)]">
          Google, GitHub, and email verification codes all use the existing Supabase session flow.
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
