import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/env";
import { sanitizeRedirectPath } from "@/lib/auth/utils";

export async function GET(request: NextRequest) {
  const redirectUrl = new URL(
    sanitizeRedirectPath(request.nextUrl.searchParams.get("next")),
    request.url,
  );

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.redirect(redirectUrl);
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return response;
  }

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    },
  );

  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
