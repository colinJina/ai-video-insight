import { NextResponse } from "next/server";

import {
  ConflictError,
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { getAnalysisTask, getAnalysisTaskForUser } from "@/lib/analysis/services/tasks";
import { getOptionalAppSession } from "@/lib/auth/session";
import { requestPythonPdfReport } from "@/lib/python-backend/client";
import type { PythonPdfReportRequest } from "@/lib/python-backend/types";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type AnalysisRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function buildPdfPayload(
  analysis: Awaited<ReturnType<typeof getAnalysisTask>>,
): PythonPdfReportRequest {
  if (!analysis.result) {
    throw new ConflictError(
      "Wait for the video analysis to complete before exporting the PDF report.",
    );
  }

  return {
    title: analysis.result.title ?? analysis.video.title,
    summary: analysis.result.summary,
    keyPoints: analysis.result.keyPoints,
    outline: analysis.result.outline,
    chatHistory: analysis.chatMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}

export async function GET(
  _request: Request,
  context: AnalysisRouteContext,
) {
  try {
    const { id } = await context.params;
    const session = await getOptionalAppSession();
    const analysis = session
      ? await getAnalysisTaskForUser(id, session.user.id)
      : await getAnalysisTask(id);
    const pdf = await requestPythonPdfReport(buildPdfPayload(analysis));

    return new NextResponse(Buffer.from(pdf.data), {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": pdf.contentType,
        "Content-Disposition":
          pdf.filename
            ? `attachment; filename="${pdf.filename}"`
            : `attachment; filename="${id}.pdf"`,
      },
    });
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
