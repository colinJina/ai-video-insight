import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
  ValidationError,
} from "@/lib/analysis/errors";
import { chatOnAnalysis } from "@/lib/analysis/services/chat";
import type { ChatInput } from "@/lib/analysis/types";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type AnalysisRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  context: AnalysisRouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await readChatInput(request);
    const analysis = await chatOnAnalysis(id, {
      message: body.message ?? "",
    });

    return NextResponse.json(
      { analysis },
      {
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

async function readChatInput(request: Request): Promise<Partial<ChatInput>> {
  try {
    return (await request.json()) as Partial<ChatInput>;
  } catch {
    throw new ValidationError("The chat request body must be valid JSON.");
  }
}
