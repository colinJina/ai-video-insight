import { NextResponse } from "next/server";

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/env";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Supabase Auth is not configured for this environment.",
        },
      },
      {
        status: 503,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  try {
    const publishableKey = getSupabasePublishableKey();
    const response = await fetch(new URL("/auth/v1/health", getSupabaseUrl()), {
      method: "GET",
      cache: "no-store",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
    });

    if (!response.ok) {
      const statusHint =
        response.status === 401 || response.status === 403
          ? "Supabase Auth rejected the publishable key. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, the project URL, and whether this app is pointed at the intended Supabase project."
          : `Supabase Auth responded with status ${response.status}. Check your Supabase project and auth settings.`;

      return NextResponse.json(
        {
          ok: false,
          error: {
            message: statusHint,
          },
        },
        {
          status: 502,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: `Cannot reach Supabase Auth at ${getSupabaseUrl()}. Check your network, DNS, proxy, and Supabase project URL, then try again.`,
        },
      },
      {
        status: 502,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
