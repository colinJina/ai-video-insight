import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import type { AppSession } from "@/lib/app/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const DEMO_SESSION_COOKIE = "video_ai_demo_session";

type DemoCookiePayload = {
  id: string;
  email: string;
  nickname?: string | null;
  avatarUrl?: string | null;
};

export async function getDemoSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_SESSION_COOKIE)?.value ?? null;
}

export async function setDemoSessionCookie(value: string) {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearDemoSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function parseDemoCookie(value: string | null): AppSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as DemoCookiePayload;
    if (!parsed.id || !parsed.email) {
      return null;
    }

    return {
      provider: "demo",
      user: {
        id: parsed.id,
        email: parsed.email,
        nickname: parsed.nickname ?? null,
        avatarUrl: parsed.avatarUrl ?? null,
      },
    };
  } catch {
    return null;
  }
}

async function getSupabaseSession(): Promise<AppSession | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id || !user.email) {
      return null;
    }

    const metadata = user.user_metadata ?? {};

    return {
      provider: "supabase",
      user: {
        id: user.id,
        email: user.email,
        nickname:
          typeof metadata.nickname === "string" ? metadata.nickname : null,
        avatarUrl:
          typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
      },
    };
  } catch {
    return null;
  }
}

export const getOptionalAppSession = cache(async (): Promise<AppSession | null> => {
  const supabaseSession = await getSupabaseSession();
  if (supabaseSession) {
    return supabaseSession;
  }

  return parseDemoCookie(await getDemoSessionCookie());
});
