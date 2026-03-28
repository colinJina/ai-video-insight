import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { createAnalysisTask } from "@/lib/analysis/service";
import { getOptionalAppSession } from "@/lib/auth/session";
import type { CreateAnalysisInput } from "@/lib/analysis/types";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateAnalysisInput>;
    const session = await getOptionalAppSession();
    const analysis = await createAnalysisTask({
      videoUrl: body.videoUrl ?? "",
      userId: session?.user.id ?? "anonymous-viewer",
    });

    return NextResponse.json(
      { analysis },
      {
        status: 202,
        headers: NO_STORE_HEADERS,
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
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
