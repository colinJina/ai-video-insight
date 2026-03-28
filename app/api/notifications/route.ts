import { NextResponse } from "next/server";

import { requireAppSession } from "@/lib/auth/guards";
import {
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications/service";

export async function GET() {
  const session = await requireAppSession();
  const notifications = await listNotificationsForUser(session.user.id);
  return NextResponse.json({ notifications });
}

export async function PATCH(request: Request) {
  const session = await requireAppSession();
  const body = (await request.json().catch(() => null)) as
    | { mode?: "all" | "single"; notificationId?: string }
    | null;

  if (body?.mode === "single" && body.notificationId) {
    await markNotificationAsRead(session.user.id, body.notificationId);
  } else {
    await markAllNotificationsAsRead(session.user.id);
  }

  return NextResponse.json({ ok: true });
}
