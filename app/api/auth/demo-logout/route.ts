import { NextResponse } from "next/server";

import { clearDemoSessionCookie } from "@/lib/auth/session";

export async function POST() {
  await clearDemoSessionCookie();
  return NextResponse.json({ ok: true });
}
