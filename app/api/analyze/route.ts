import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
  ValidationError,
} from "@/lib/analysis/errors";
import {
  createPipelineTraceId,
  logPipelineEvent,
  previewText,
} from "@/lib/analysis/debug";
import { createAnalysisTask } from "@/lib/analysis/services/tasks";
import { requireAppApiSession } from "@/lib/auth/guards";
import type { CreateAnalysisInput } from "@/lib/analysis/types";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  const traceId = createPipelineTraceId("analyze");

  try {
    const session = await requireAppApiSession();
    const contentType = request.headers.get("content-type") ?? "";
    let input: CreateAnalysisInput;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("videoFile");

      if (!(file instanceof File)) {
        throw new ValidationError("Please choose an MP4 file to upload.");
      }

      input = {
        uploadedVideo: {
          fileName: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
          buffer: await file.arrayBuffer(),
        },
      };
    } else {
      const body = (await request.json()) as Partial<CreateAnalysisInput>;
      input = {
        videoUrl: body.videoUrl ?? "",
      };
    }

    logPipelineEvent("next.analyze", "received_analysis_request", {
      traceId,
      userId: session.user.id,
      contentType,
      videoUrl: previewText(input.videoUrl),
      uploadedVideo: input.uploadedVideo
        ? {
            fileName: input.uploadedVideo.fileName,
            mimeType: input.uploadedVideo.mimeType,
            fileSizeBytes: input.uploadedVideo.fileSizeBytes,
          }
        : null,
    });

    const analysis = await createAnalysisTask({
      ...input,
      userId: session.user.id,
    });

    logPipelineEvent("next.analyze", "analysis_task_created", {
      traceId,
      analysisId: analysis.id,
      status: analysis.status,
      title: analysis.result?.title ?? analysis.video.title,
      transcriptSource: analysis.transcriptSource,
    });

    return NextResponse.json(
      { analysis },
      {
        status: 202,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    logPipelineEvent("next.analyze", "analysis_request_failed", {
      traceId,
      errorCode: getErrorCode(error),
      message: getPublicErrorMessage(error),
    });

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
