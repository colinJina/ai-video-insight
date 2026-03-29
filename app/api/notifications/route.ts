import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { requireAppApiSession } from "@/lib/auth/guards";
import {
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications/service";

export async function GET() {
  try {
    const session = await requireAppApiSession();
    const notifications = await listNotificationsForUser(session.user.id);
    return NextResponse.json({ notifications });
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

export async function PATCH(request: Request) {
  try {
    const session = await requireAppApiSession();
    const body = (await request.json().catch(() => null)) as
      | { mode?: "all" | "single"; notificationId?: string }
      | null;

    if (body?.mode === "single" && body.notificationId) {
      await markNotificationAsRead(session.user.id, body.notificationId);
    } else {
      await markAllNotificationsAsRead(session.user.id);
    }

    return NextResponse.json({ ok: true });
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
