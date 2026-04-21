import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { requireAppApiSession } from "@/lib/auth/guards";
import {
  markAnalysisNotificationsAsRead,
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
      | {
          mode?: "all" | "single" | "analysis";
          notificationId?: string;
          analysisId?: string;
        }
      | null;
    let markedCount = 0;

    if (body?.mode === "single" && body.notificationId) {
      await markNotificationAsRead(session.user.id, body.notificationId);
      markedCount = 1;
    } else if (body?.mode === "analysis" && body.analysisId) {
      markedCount = await markAnalysisNotificationsAsRead(
        session.user.id,
        body.analysisId,
      );
    } else {
      await markAllNotificationsAsRead(session.user.id);
    }

    return NextResponse.json({ ok: true, markedCount });
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
