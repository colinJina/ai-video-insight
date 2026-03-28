import { NextResponse } from "next/server";

import type { AppThemePreference } from "@/lib/app/types";
import { requireAppSession } from "@/lib/auth/guards";
import { getSettingsForUser, upsertSettingsForUser } from "@/lib/settings/service";

type SettingsPayload = {
  nickname?: string;
  avatarUrl?: string;
  notificationsEnabled?: boolean;
  themePreference?: AppThemePreference;
};

export async function GET() {
  const session = await requireAppSession();
  const settings = await getSettingsForUser(session.user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const session = await requireAppSession();
  const body = (await request.json().catch(() => null)) as SettingsPayload | null;

  const settings = await upsertSettingsForUser(session.user.id, {
    nickname: body?.nickname?.trim() || null,
    avatarUrl: body?.avatarUrl?.trim() || null,
    notificationsEnabled: body?.notificationsEnabled ?? true,
    themePreference: body?.themePreference ?? "system",
  });

  return NextResponse.json({ settings });
}
