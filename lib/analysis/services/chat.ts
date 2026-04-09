import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import { createEmbeddingProvider } from "@/lib/analysis/providers/embedding";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import { createAssistantMessage, createUserMessage } from "@/lib/analysis/services/messages";
import { getTranscriptChunkRepository } from "@/lib/analysis/transcript-chunk-repository";
import type {
  AnalysisChatMessage,
  AnalysisChatContextPayload,
  AnalysisChatRuntimeState,
  TranscriptChunkMatch,
  AnalysisTask,
  AnalysisPublicTask,
  ChatInput,
} from "@/lib/analysis/types";
import { requestPythonChatAnswer } from "@/lib/python-backend/client";
import type {
  PythonChatMemoryItem,
  PythonChatRequest,
} from "@/lib/python-backend/types";
import {
  buildTranscriptExcerpt,
  formatTimestamp,
  hasUsableTimestamp,
  normalizeWhitespace,
  trimText,
} from "@/lib/analysis/utils";

const RETRIEVED_CHUNK_LIMIT = 4;

function toPythonChatMessages(
  messages: AnalysisChatMessage[],
): PythonChatRequest["recentMessages"] {
  return messages.slice(-6).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function buildPythonChatRequest(
  message: string,
  context: AnalysisChatContextPayload,
): PythonChatRequest {
  return {
    userId: context.userId,
    analysisId: context.analysisId,
    analysisSummary: context.analysisSummary,
    transcriptExcerpt: context.transcriptExcerpt,
    outline: context.outline,
    keyPoints: context.keyPoints,
    message,
    recentMessages: toPythonChatMessages(context.recentMessages),
    memoryItems: context.memoryItems,
  };
}

function buildRequestDrivenMemoryItems(
  task: AnalysisTask,
): PythonChatMemoryItem[] {
  if (!task.result) {
    return [];
  }

  const memoryItems: PythonChatMemoryItem[] = [];

  if (task.result.summary) {
    memoryItems.push({
      kind: "analysis_summary",
      content: task.result.summary,
      source: "analysis.result.summary",
      metadata: {
        scope: "long_term",
      },
    });
  }

  task.result.keyPoints.slice(0, 6).forEach((keyPoint, index) => {
    memoryItems.push({
      kind: "key_point",
      content: keyPoint,
      source: "analysis.result.keyPoints",
      metadata: {
        scope: "long_term",
        index,
      },
    });
  });

  task.result.outline.slice(0, 8).forEach((item, index) => {
    const content = item.time ? `[${item.time}] ${item.text}` : item.text;
    memoryItems.push({
      kind: "outline_item",
      content,
      source: "analysis.result.outline",
      metadata: {
        scope: "long_term",
        index,
        time: item.time,
      },
    });
  });

  return memoryItems;
}

function buildRetrievedChunkMemoryItems(
  matches: TranscriptChunkMatch[],
): PythonChatMemoryItem[] {
  const sortedMatches = [...matches].sort(
    (left, right) => left.chunkIndex - right.chunkIndex,
  );

  return sortedMatches.map((match) => ({
    kind: "retrieved_chunk",
    content: match.text,
    source: "analysis.transcript_chunks",
    metadata: {
      chunkIndex: match.chunkIndex,
      score: Number(match.score.toFixed(6)),
      startSeconds: match.startSeconds,
      endSeconds: match.endSeconds,
    },
  }));
}

function buildRetrievedTranscriptExcerpt(
  matches: TranscriptChunkMatch[],
) {
  const sortedMatches = [...matches].sort(
    (left, right) => left.chunkIndex - right.chunkIndex,
  );

  return trimText(
    sortedMatches
      .map((match) =>
        hasUsableTimestamp(match.startSeconds)
          ? `[${formatTimestamp(match.startSeconds)}] ${match.text}`
          : match.text,
      )
      .join(" "),
    2400,
  );
}

async function retrieveTranscriptMatches(
  task: AnalysisTask,
  message: string,
) {
  const embeddingProvider = createEmbeddingProvider();
  if (!embeddingProvider.isConfigured()) {
    return [];
  }

  const repository = getTranscriptChunkRepository();

  try {
    const queryEmbedding = await embeddingProvider.embedText(message);
    return await repository.matchForAnalysis({
      analysisId: task.id,
      userId: task.userId,
      queryEmbedding,
      limit: RETRIEVED_CHUNK_LIMIT,
    });
  } catch (error) {
    console.warn(
      `[analysis] Transcript retrieval failed for analysis ${task.id}. Falling back to static transcript excerpt.`,
      error,
    );
    return [];
  }
}

async function buildAnalysisChatContext(
  id: string,
  task: AnalysisTask,
  recentMessages: AnalysisChatMessage[],
  latestMessage: string,
): Promise<AnalysisChatContextPayload> {
  if (!task.result || !task.transcript) {
    throw new ConflictError(
      "Wait for the video analysis to complete before sending chat messages.",
    );
  }

  const retrievedMatches = await retrieveTranscriptMatches(task, latestMessage);
  const retrievedMemoryItems = buildRetrievedChunkMemoryItems(retrievedMatches);
  const transcriptExcerpt =
    retrievedMatches.length > 0
      ? buildRetrievedTranscriptExcerpt(retrievedMatches)
      : buildTranscriptExcerpt(task.transcript.segments, 2400);

  return {
    userId: task.userId,
    analysisId: id,
    analysisSummary: task.result.summary,
    transcriptExcerpt,
    outline: task.result.outline,
    keyPoints: task.result.keyPoints,
    recentMessages,
    memoryItems: [
      ...buildRequestDrivenMemoryItems(task),
      ...retrievedMemoryItems,
    ],
  };
}

function buildChatRuntimeState(
  pythonResponse: Awaited<ReturnType<typeof requestPythonChatAnswer>>,
): AnalysisChatRuntimeState {
  return {
    memoryHits: pythonResponse.memoryHits,
    conversationSummary: pythonResponse.conversationSummary,
    memoryItems: pythonResponse.memoryItems.map((item) => ({
      kind: item.kind,
      content: item.content,
      source: item.source,
      metadata: item.metadata,
    })),
  };
}

export async function chatOnAnalysis(
  id: string,
  input: ChatInput,
): Promise<AnalysisPublicTask> {
  const message = normalizeWhitespace(input.message ?? "");
  if (!message) {
    throw new ValidationError("Please enter a follow-up question.");
  }

  const repository = getAnalysisRepository();
  const task = await repository.findById(id);

  if (!task) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  if (!task.result || !task.transcript || task.status !== "completed") {
    throw new ConflictError("Wait for the video analysis to complete before sending chat messages.");
  }

  const userMessage = createUserMessage(trimText(message, 500));
  const context = await buildAnalysisChatContext(
    id,
    task,
    [...task.chatMessages, userMessage],
    userMessage.content,
  );
  const pythonRequest = buildPythonChatRequest(
    userMessage.content,
    context,
  );
  const pythonResponse = await requestPythonChatAnswer(pythonRequest);

  const assistantMessage = createAssistantMessage(
    trimText(pythonResponse.answer, 480),
  );
  const updatedTask = await repository.appendChatMessages(id, [
    userMessage,
    assistantMessage,
  ]);

  if (!updatedTask) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return {
    ...toPublicAnalysisTask(updatedTask),
    chatRuntime: buildChatRuntimeState(pythonResponse),
  };
}
