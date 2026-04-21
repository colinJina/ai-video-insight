import {
  ExternalServiceError,
  getPublicErrorMessage,
} from "@/lib/analysis/errors";
import { getAnalysisCheckpointRepository } from "@/lib/analysis/checkpoint-repository";
import { getAnalysisJobRepository } from "@/lib/analysis/job-repository";
import { getAnalysisMemoryStoreRepository } from "@/lib/analysis/memory-store-repository";
import { createEmbeddingProvider } from "@/lib/analysis/providers/embedding";
import { createAiProvider } from "@/lib/analysis/providers/ai";
import { createTranscriptProvider } from "@/lib/analysis/providers/transcript";
import { getAnalysisRepository } from "@/lib/analysis/repository";
import { buildAnalysisResult } from "@/lib/analysis/result";
import { createAssistantMessage } from "@/lib/analysis/services/messages";
import { getTranscriptChunkRepository } from "@/lib/analysis/transcript-chunk-repository";
import { chunkTranscriptSegments } from "@/lib/analysis/transcript-chunking";
import type {
  AnalysisChatMessage,
  AnalysisJob,
  AnalysisJobStage,
  AnalysisResult,
  AnalysisTask,
  TranscriptData,
  TranscriptSourceKind,
} from "@/lib/analysis/types";
import { isRecord } from "@/lib/analysis/utils";
import { createNotification } from "@/lib/notifications/service";

type ProcessAnalysisTaskInput = {
  analysisId: string;
  job?: AnalysisJob;
  workerId?: string;
};

type TranscriptCheckpointPayload = {
  transcript: TranscriptData;
  transcriptSource: TranscriptSourceKind;
};

type SummaryCheckpointPayload = {
  result: AnalysisResult;
  chatMessages: AnalysisChatMessage[];
};

function buildProcessingErrorMessage(
  stage: "transcript" | "summary",
  error: unknown,
  transcriptSource?: "mock" | "remote" | null,
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

function computeRetryDelaySeconds(attempt: number) {
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 5 * 60);
}

function readTranscriptCheckpointPayload(
  payload: Record<string, unknown> | null,
): TranscriptCheckpointPayload | null {
  if (!payload || !isRecord(payload)) {
    return null;
  }

  const transcript = payload.transcript;
  const transcriptSource = payload.transcriptSource;

  if (!isRecord(transcript)) {
    return null;
  }

  if (transcriptSource !== "mock" && transcriptSource !== "remote") {
    return null;
  }

  return {
    transcript: transcript as unknown as TranscriptData,
    transcriptSource,
  };
}

function readSummaryCheckpointPayload(
  payload: Record<string, unknown> | null,
): SummaryCheckpointPayload | null {
  if (!payload || !isRecord(payload)) {
    return null;
  }

  const result = payload.result;
  const chatMessages = payload.chatMessages;

  if (!isRecord(result) || !Array.isArray(chatMessages)) {
    return null;
  }

  return {
    result: result as unknown as AnalysisResult,
    chatMessages: chatMessages as AnalysisChatMessage[],
  };
}

async function indexTranscriptChunks(input: {
  analysisId: string;
  userId: string;
  transcript: Parameters<typeof chunkTranscriptSegments>[0];
}) {
  const embeddingProvider = createEmbeddingProvider();
  if (!embeddingProvider.isConfigured()) {
    return;
  }

  const chunks = chunkTranscriptSegments(input.transcript);
  if (chunks.length === 0) {
    return;
  }

  const chunkRepository = getTranscriptChunkRepository();
  const chunkRows = await Promise.all(
    chunks.map(async (chunk) => ({
      ...chunk,
      embedding: await embeddingProvider.embedText(chunk.text),
    })),
  );

  await chunkRepository.replaceForAnalysis({
    analysisId: input.analysisId,
    userId: input.userId,
    chunks: chunkRows,
  });
}

async function recordCheckpoint(input: {
  task: AnalysisTask;
  attempt: number;
  stage: AnalysisJobStage;
  status: "started" | "completed" | "failed";
  payload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  await getAnalysisCheckpointRepository().save({
    analysisId: input.task.id,
    userId: input.task.userId,
    stage: input.stage,
    attempt: input.attempt,
    status: input.status,
    payload: input.payload ?? null,
    errorMessage: input.errorMessage ?? null,
  });
}

async function restoreTaskFromCompletedCheckpoints(task: AnalysisTask) {
  const repository = getAnalysisRepository();
  const checkpointRepository = getAnalysisCheckpointRepository();
  let currentTask = task;

  if (!currentTask.transcript) {
    const transcriptCheckpoint = await checkpointRepository.findLatestCompleted(
      currentTask.id,
      "transcript",
    );
    const transcriptPayload = readTranscriptCheckpointPayload(
      transcriptCheckpoint?.payload ?? null,
    );

    if (transcriptPayload) {
      currentTask =
        (await repository.update(currentTask.id, {
          status: "processing",
          transcript: transcriptPayload.transcript,
          transcriptSource: transcriptPayload.transcriptSource,
          errorMessage: null,
        })) ?? {
          ...currentTask,
          status: "processing",
          transcript: transcriptPayload.transcript,
          transcriptSource: transcriptPayload.transcriptSource,
          errorMessage: null,
        };
    }
  }

  if (!currentTask.result) {
    const summaryCheckpoint = await checkpointRepository.findLatestCompleted(
      currentTask.id,
      "summary",
    );
    const summaryPayload = readSummaryCheckpointPayload(
      summaryCheckpoint?.payload ?? null,
    );

    if (summaryPayload) {
      currentTask =
        (await repository.update(currentTask.id, {
          status: "processing",
          result: summaryPayload.result,
          chatMessages: summaryPayload.chatMessages,
          errorMessage: null,
        })) ?? {
          ...currentTask,
          status: "processing",
          result: summaryPayload.result,
          chatMessages: summaryPayload.chatMessages,
          errorMessage: null,
        };
    }
  }

  return currentTask;
}

async function markJobStage(
  analysisId: string,
  workerId: string | undefined,
  stage: AnalysisJobStage,
) {
  if (!workerId) {
    return;
  }

  await getAnalysisJobRepository().markStage(analysisId, workerId, stage);
}

async function finalizeFailure(input: {
  task: AnalysisTask;
  job?: AnalysisJob;
  workerId?: string;
  stage: "transcript" | "summary";
  transcriptSource?: TranscriptSourceKind | null;
  error: unknown;
}) {
  const repository = getAnalysisRepository();
  const errorMessage = buildProcessingErrorMessage(
    input.stage,
    input.error,
    input.transcriptSource,
  );
  const attempt = input.job?.attemptCount ?? 1;

  await recordCheckpoint({
    task: input.task,
    attempt,
    stage: input.stage,
    status: "failed",
    errorMessage,
  });

  if (input.job && input.workerId) {
    const failedJob = await getAnalysisJobRepository().fail({
      analysisId: input.task.id,
      workerId: input.workerId,
      stage: input.stage,
      errorMessage,
      retryDelaySeconds: computeRetryDelaySeconds(input.job.attemptCount),
    });

    if (failedJob?.status === "queued") {
      await repository.update(input.task.id, {
        status: "queued",
        errorMessage: null,
      });
      return;
    }
  }

  await repository.update(input.task.id, {
    status: "failed",
    errorMessage,
  });

  await createNotification({
    userId: input.task.userId,
    type: "analysis_failed",
    title: "Analysis failed",
    body:
      input.stage === "summary"
        ? `"${input.task.video.title}" failed during AI summary generation. Please try again later.`
        : `"${input.task.video.title}" failed during transcript preparation. Check the source and try again.`,
    relatedAnalysisId: input.task.id,
  });
}

export async function processAnalysisTask({
  analysisId,
  job,
  workerId,
}: ProcessAnalysisTaskInput) {
  const repository = getAnalysisRepository();
  let task = await repository.findById(analysisId);

  if (!task) {
    if (job && workerId) {
      await getAnalysisJobRepository().fail({
        analysisId,
        workerId,
        stage: "failed",
        errorMessage: "The analysis record could not be found.",
        retryDelaySeconds: computeRetryDelaySeconds(job.attemptCount),
      });
    }
    return;
  }

  if (task.status === "completed") {
    if (job && workerId) {
      await getAnalysisJobRepository().complete(analysisId, workerId);
    }
    return;
  }

  task =
    (await repository.update(analysisId, {
      status: "processing",
      errorMessage: null,
    })) ?? {
      ...task,
      status: "processing",
      errorMessage: null,
    };

  task = await restoreTaskFromCompletedCheckpoints(task);

  const transcriptProvider = createTranscriptProvider();
  const aiProvider = createAiProvider();
  const memoryStoreRepository = getAnalysisMemoryStoreRepository();
  const attempt = job?.attemptCount ?? 1;

  try {
    if (!task.transcript) {
      await markJobStage(analysisId, workerId, "transcript");
      await recordCheckpoint({
        task,
        attempt,
        stage: "transcript",
        status: "started",
        payload: {
          videoTitle: task.video.title,
        },
      });

      const transcript = await transcriptProvider.getTranscript({
        video: task.video,
      });

      task =
        (await repository.update(task.id, {
          status: "processing",
          transcript,
          transcriptSource: transcript.source,
          errorMessage: null,
        })) ?? {
          ...task,
          transcript,
          transcriptSource: transcript.source,
          errorMessage: null,
        };

      await recordCheckpoint({
        task,
        attempt,
        stage: "transcript",
        status: "completed",
        payload: {
          transcript,
          transcriptSource: transcript.source,
        },
      });
    }

    if (!task.result || task.chatMessages.length === 0) {
      await markJobStage(analysisId, workerId, "summary");
      await recordCheckpoint({
        task,
        attempt,
        stage: "summary",
        status: "started",
        payload: {
          transcriptSource: task.transcriptSource,
        },
      });

      const structuredSummary = await aiProvider.generateVideoSummary({
        video: task.video,
        transcript: task.transcript!,
      });
      const baseResult = buildAnalysisResult(structuredSummary);
      const persistedState = await memoryStoreRepository.getState(task.id, task.userId);
      const result: AnalysisResult = {
        ...baseResult,
        chatState: persistedState,
      };
      const introMessage = createAssistantMessage(result.chatContext.intro);
      const chatMessages = [introMessage];

      task =
        (await repository.update(task.id, {
          status: "processing",
          result,
          chatMessages,
          errorMessage: null,
        })) ?? {
          ...task,
          result,
          chatMessages,
          errorMessage: null,
        };

      await recordCheckpoint({
        task,
        attempt,
        stage: "summary",
        status: "completed",
        payload: {
          result,
          chatMessages,
        },
      });
    }

    await markJobStage(analysisId, workerId, "indexing");
    await recordCheckpoint({
      task,
      attempt,
      stage: "indexing",
      status: "started",
      payload: null,
    });

    try {
      await indexTranscriptChunks({
        analysisId: task.id,
        userId: task.userId,
        transcript: task.transcript!.segments,
      });

      await recordCheckpoint({
        task,
        attempt,
        stage: "indexing",
        status: "completed",
        payload: {
          chunkCount: chunkTranscriptSegments(task.transcript!.segments).length,
        },
      });
    } catch (error) {
      console.warn(
        `[analysis] Transcript chunk indexing failed for analysis ${task.id}. Falling back to static transcript excerpts.`,
        error,
      );

      await recordCheckpoint({
        task,
        attempt,
        stage: "indexing",
        status: "completed",
        payload: {
          warning: "transcript_chunk_indexing_failed",
        },
      });
    }

    await repository.update(task.id, {
      status: "completed",
      errorMessage: null,
    });

    if (job && workerId) {
      await getAnalysisJobRepository().complete(task.id, workerId);
    }

    await createNotification({
      userId: task.userId,
      type: "analysis_completed",
      title: "Analysis completed",
      body: `"${task.result!.title}" now has a summary, key points, and suggested follow-up questions.`,
      relatedAnalysisId: task.id,
    });
  } catch (error) {
    const failedAtSummary = Boolean(task.transcript);
    const stage = failedAtSummary ? "summary" : "transcript";
    const transcriptSource =
      stage === "transcript"
        ? transcriptProvider.kind === "mock" ||
          error instanceof ExternalServiceError
          ? transcriptProvider.kind
          : null
        : task.transcriptSource;

    if (stage === "transcript") {
      await repository.update(task.id, {
        transcriptSource,
      });
    }

    await finalizeFailure({
      task,
      job,
      workerId,
      stage,
      transcriptSource,
      error,
    });
  }
}
