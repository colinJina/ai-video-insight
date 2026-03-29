import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import type { AppThemePreference } from "@/lib/app/types";
import { requireAppApiSession } from "@/lib/auth/guards";
import { getSettingsForUser, upsertSettingsForUser } from "@/lib/settings/service";

type SettingsPayload = {
  nickname?: string;
  avatarUrl?: string;
  notificationsEnabled?: boolean;
  themePreference?: AppThemePreference;
};

export async function GET() {
  try {
    const session = await requireAppApiSession();
    const settings = await getSettingsForUser(session.user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: getErrorCode(error),
          message: getPublicErrorMessage(error),
        },
      },
      { status: getErrorStatusCode(error) },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAppApiSession();
    const body = (await request.json().catch(() => null)) as SettingsPayload | null;

    const settings = await upsertSettingsForUser(session.user.id, {
      nickname: body?.nickname?.trim() || null,
      avatarUrl: body?.avatarUrl?.trim() || null,
      notificationsEnabled: body?.notificationsEnabled ?? true,
      themePreference: body?.themePreference ?? "system",
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: getErrorCode(error),
          message: getPublicErrorMessage(error),
        },
      },
      { status: getErrorStatusCode(error) },
    );
  }
}
