import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { setAnalysisArchived } from "@/lib/analysis/services/tasks";
import { requireAppApiSession } from "@/lib/auth/guards";

type ArchiveRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: ArchiveRouteContext) {
  try {
    const session = await requireAppApiSession();
    const { id } = await context.params;
    const body = (await request.json()) as { archived?: boolean };
    const analysis = await setAnalysisArchived(
      id,
      session.user.id,
      Boolean(body.archived),
    );

    return NextResponse.json(
      { analysis },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: getErrorCode(error),
          message: getPublicErrorMessage(error),
        },
      },
      {
        status: getErrorStatusCode(error),
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
