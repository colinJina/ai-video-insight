import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { setDemoSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string }
    | null;
  const email = body?.email?.trim() ?? "";

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      {
        error: {
          message: "Please enter a valid email address.",
        },
      },
      { status: 400 },
    );
  }

  await setDemoSessionCookie(
    JSON.stringify({
      id: `demo-${randomUUID()}`,
      email,
      nickname: email.split("@")[0],
    }),
  );

  return NextResponse.json({ ok: true });
}
