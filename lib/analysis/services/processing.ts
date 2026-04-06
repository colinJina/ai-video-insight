import {
  ExternalServiceError,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { createAiProvider } from "@/lib/analysis/providers/ai";
import { createTranscriptProvider } from "@/lib/analysis/providers/transcript";
import { getAnalysisRepository } from "@/lib/analysis/repository";
import { buildAnalysisResult } from "@/lib/analysis/result";
import { createAssistantMessage } from "@/lib/analysis/services/messages";
import { createNotification } from "@/lib/notifications/service";

function buildProcessingErrorMessage(
  stage: "transcript" | "summary",
  error: unknown,
  transcriptSource?: "mock" | "remote",
) {
  const detail = getPublicErrorMessage(error);

  if (stage === "transcript") {
    if (transcriptSource === "mock") {
      return `Transcript generation fell back to mock content instead of the real video. ${detail}`;
    }

    return `Transcript generation failed. ${detail}`;
  }

  return `AI summary generation failed. ${detail}`;
}

export async function processAnalysisTask(id: string) {
  const repository = getAnalysisRepository();
  const existing = await repository.findById(id);

  if (!existing || existing.status === "completed" || existing.status === "failed") {
    return;
  }

  await repository.update(id, {
    status: "processing",
    errorMessage: null,
  });

  const transcriptProvider = createTranscriptProvider();
  const aiProvider = createAiProvider();
  const latestTask = await repository.findById(id);

  if (!latestTask) {
    return;
  }

  try {
    const transcript = await transcriptProvider.getTranscript({
      video: latestTask.video,
    });

    try {
      const structuredSummary = await aiProvider.generateVideoSummary({
        video: latestTask.video,
        transcript,
      });
      const result = buildAnalysisResult(structuredSummary);
      const introMessage = createAssistantMessage(result.chatContext.intro);

      await repository.update(id, {
        status: "completed",
        transcript,
        transcriptSource: transcript.source,
        result,
        chatMessages: [introMessage],
        errorMessage: null,
      });

      await createNotification({
        userId: latestTask.userId,
        type: "analysis_completed",
        title: "Analysis completed",
        body: `"${result.title}" now has a summary, key points, and suggested follow-up questions.`,
        relatedAnalysisId: latestTask.id,
      });
    } catch (error) {
      await repository.update(id, {
        status: "failed",
        transcript,
        transcriptSource: transcript.source,
        errorMessage: buildProcessingErrorMessage("summary", error),
      });

      await createNotification({
        userId: latestTask.userId,
        type: "analysis_failed",
        title: "Analysis failed",
        body: `"${latestTask.video.title}" failed during AI summary generation. Please try again later.`,
        relatedAnalysisId: latestTask.id,
      });
    }
  } catch (error) {
    await repository.update(id, {
      status: "failed",
      transcriptSource:
        transcriptProvider.kind === "mock" || error instanceof ExternalServiceError
          ? transcriptProvider.kind
          : null,
      errorMessage: buildProcessingErrorMessage(
        "transcript",
        error,
        transcriptProvider.kind,
      ),
    });

    await createNotification({
      userId: latestTask.userId,
      type: "analysis_failed",
      title: "Analysis failed",
      body: `"${latestTask.video.title}" failed during transcript preparation. Check the source and try again.`,
      relatedAnalysisId: latestTask.id,
    });
  }
}
