import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import {
  getRetrievalCandidateLimit,
  getRetrievalFinalLimit,
  getRetrievalNeighborWindow,
  getRetrievalScoreThreshold,
  isRetrievalQueryRewriteEnabled,
} from "@/lib/analysis/env";
import { createEmbeddingProvider } from "@/lib/analysis/providers/embedding";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import {
  createAssistantMessage,
  createUserMessage,
} from "@/lib/analysis/services/messages";
import { chunkTranscriptSegments } from "@/lib/analysis/transcript-chunking";
import { getTranscriptChunkRepository } from "@/lib/analysis/transcript-chunk-repository";
import type {
  AnalysisChatCitation,
  AnalysisChatMessage,
  AnalysisChatContextPayload,
  AnalysisChatRetrievalDebug,
  AnalysisChatRuntimeState,
  AnalysisStoredMemoryItem,
  TranscriptChunk,
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

const RECENT_MESSAGE_LIMIT = 8;
const RETRIEVAL_CANDIDATE_LIMIT = getRetrievalCandidateLimit();
const RETRIEVAL_FINAL_LIMIT = getRetrievalFinalLimit();
const RETRIEVAL_NEIGHBOR_WINDOW = getRetrievalNeighborWindow();
const RETRIEVAL_SCORE_THRESHOLD = getRetrievalScoreThreshold();
const STORED_MEMORY_LIMIT = 4;

type RetrievalSelection = {
  matches: TranscriptChunkMatch[];
  debug: AnalysisChatRetrievalDebug;
};

type AnalysisChatContextBuildResult = {
  payload: AnalysisChatContextPayload;
  retrievalDebug: AnalysisChatRetrievalDebug;
  citations: AnalysisChatCitation[];
};

function toPythonChatMessages(
  messages: AnalysisChatMessage[],
): PythonChatRequest["recentMessages"] {
  return messages.slice(-RECENT_MESSAGE_LIMIT).map((message) => ({
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
    storedConversationSummary: context.storedConversationSummary,
    outline: context.outline,
    keyPoints: context.keyPoints,
    message,
    recentMessages: toPythonChatMessages(context.recentMessages),
    memoryItems: context.memoryItems,
    storedMemoryItems: context.storedMemoryItems,
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

function getChatState(task: AnalysisTask) {
  return task.result?.chatState ?? {
    conversationSummary: null,
    memoryItems: [],
  };
}

function normalizeMemoryText(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function readMemoryImportance(item: {
  metadata?: Record<string, unknown>;
}) {
  const importance = item.metadata?.importance;
  if (typeof importance === "number" && Number.isFinite(importance)) {
    return Math.min(Math.max(importance, 0), 1);
  }

  return 0.5;
}

function scoreStoredMemoryItem(query: string, item: AnalysisStoredMemoryItem) {
  return computeLexicalScore(query, item.content) * 0.7 + readMemoryImportance(item) * 0.3;
}

function recallStoredMemoryItems(
  task: AnalysisTask,
  query: string,
): PythonChatMemoryItem[] {
  const storedItems = getChatState(task).memoryItems;
  if (storedItems.length === 0) {
    return [];
  }

  const ranked = storedItems
    .map((item) => ({
      item,
      score: scoreStoredMemoryItem(query, item),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.item.updatedAt.localeCompare(left.item.updatedAt);
    });

  const selected = ranked.some((entry) => entry.score > 0)
    ? ranked.filter((entry) => entry.score > 0).slice(0, STORED_MEMORY_LIMIT)
    : ranked.slice(0, Math.min(2, STORED_MEMORY_LIMIT));

  return selected.map(({ item, score }) => ({
    kind: item.kind,
    content: item.content,
    source: item.source,
    metadata: {
      ...item.metadata,
      recalledFrom: "analysis.result.chatState.memoryItems",
      recallScore: Number(score.toFixed(6)),
    },
  }));
}

function mergeStoredMemoryItems(
  existingItems: AnalysisStoredMemoryItem[],
  updates: PythonChatMemoryItem[],
) {
  if (updates.length === 0) {
    return existingItems;
  }

  const now = new Date().toISOString();
  const merged = new Map<string, AnalysisStoredMemoryItem>();

  for (const item of existingItems) {
    merged.set(`${item.kind.toLowerCase()}::${normalizeMemoryText(item.content)}`, item);
  }

  for (const update of updates) {
    const key = `${update.kind.toLowerCase()}::${normalizeMemoryText(update.content)}`;
    const current = merged.get(key);

    if (current) {
      merged.set(key, {
        ...current,
        source: update.source ?? current.source ?? null,
        metadata: {
          ...(current.metadata ?? {}),
          ...(update.metadata ?? {}),
          importance: Math.max(readMemoryImportance(current), readMemoryImportance(update)),
        },
        updatedAt: now,
      });
      continue;
    }

    merged.set(key, {
      id: crypto.randomUUID(),
      kind: update.kind,
      content: update.content,
      source: update.source ?? null,
      metadata: update.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...merged.values()]
    .sort((left, right) => {
      const importanceDiff = readMemoryImportance(right) - readMemoryImportance(left);
      if (importanceDiff !== 0) {
        return importanceDiff;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 12);
}

function sortMatchesByChunkIndex(matches: TranscriptChunkMatch[]) {
  return [...matches].sort((left, right) => left.chunkIndex - right.chunkIndex);
}

function buildRetrievedChunkMemoryItems(
  matches: TranscriptChunkMatch[],
): PythonChatMemoryItem[] {
  return sortMatchesByChunkIndex(matches).map((match) => ({
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

function buildRetrievedTranscriptExcerpt(matches: TranscriptChunkMatch[]) {
  return trimText(
    sortMatchesByChunkIndex(matches)
      .map((match) =>
        hasUsableTimestamp(match.startSeconds)
          ? `[${formatTimestamp(match.startSeconds)}] ${match.text}`
          : match.text,
      )
      .join(" "),
    2400,
  );
}

function buildCitations(matches: TranscriptChunkMatch[]): AnalysisChatCitation[] {
  return sortMatchesByChunkIndex(matches).map((match) => ({
    chunkIndex: match.chunkIndex,
    text: match.text,
    score: Number(match.score.toFixed(6)),
    startSeconds: match.startSeconds,
    endSeconds: match.endSeconds,
  }));
}

function tokenizeForOverlap(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .filter((token) => token.length >= 3);
}

function buildRetrievalQuery(
  task: AnalysisTask,
  recentMessages: AnalysisChatMessage[],
  latestMessage: string,
) {
  if (!isRetrievalQueryRewriteEnabled()) {
    return latestMessage;
  }

  const previousUserMessages = recentMessages
    .filter((message) => message.role === "user" && message.content !== latestMessage)
    .slice(-2)
    .map((message) => message.content);
  const latestTokens = tokenizeForOverlap(latestMessage);
  const isShortQuestion = latestTokens.length <= 5;
  const usesImplicitReference = /\b(it|this|that|they|them|these|those|why|how)\b/i.test(
    latestMessage,
  );

  if (!isShortQuestion && !usesImplicitReference) {
    return latestMessage;
  }

  const queryParts = [
    ...previousUserMessages.slice(-1),
    task.result?.summary ?? "",
    latestMessage,
  ]
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (queryParts.length <= 1) {
    return latestMessage;
  }

  return normalizeWhitespace(queryParts.join(" "));
}

function computeLexicalScore(query: string, text: string) {
  const queryTokens = new Set(tokenizeForOverlap(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const textTokens = new Set(tokenizeForOverlap(text));
  let overlap = 0;

  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / queryTokens.size;
}

function rerankMatches(
  query: string,
  matches: TranscriptChunkMatch[],
) {
  return matches
    .map((match) => ({
      match,
      combinedScore:
        match.score * 0.7 + computeLexicalScore(query, match.text) * 0.3,
    }))
    .filter((entry) => entry.combinedScore >= RETRIEVAL_SCORE_THRESHOLD)
    .sort((left, right) => right.combinedScore - left.combinedScore)
    .slice(0, RETRIEVAL_FINAL_LIMIT)
    .map((entry) => ({
      ...entry.match,
      score: Number(entry.combinedScore.toFixed(6)),
    }));
}

function expandNeighborMatches(
  task: AnalysisTask,
  matches: TranscriptChunkMatch[],
) {
  if (matches.length === 0 || !task.transcript || RETRIEVAL_NEIGHBOR_WINDOW <= 0) {
    return matches;
  }

  const allChunks = chunkTranscriptSegments(task.transcript.segments);
  const chunkByIndex = new Map<number, TranscriptChunk>();
  const matchByIndex = new Map<number, TranscriptChunkMatch>();

  allChunks.forEach((chunk) => {
    chunkByIndex.set(chunk.chunkIndex, chunk);
  });
  matches.forEach((match) => {
    matchByIndex.set(match.chunkIndex, match);
  });

  for (const match of matches) {
    for (
      let offset = -RETRIEVAL_NEIGHBOR_WINDOW;
      offset <= RETRIEVAL_NEIGHBOR_WINDOW;
      offset += 1
    ) {
      if (offset === 0) {
        continue;
      }

      const neighborIndex = match.chunkIndex + offset;
      if (matchByIndex.has(neighborIndex)) {
        continue;
      }

      const neighborChunk = chunkByIndex.get(neighborIndex);
      if (!neighborChunk) {
        continue;
      }

      matchByIndex.set(neighborIndex, {
        id: `${task.id}:${neighborChunk.chunkIndex}`,
        analysisId: task.id,
        userId: task.userId,
        chunkIndex: neighborChunk.chunkIndex,
        text: neighborChunk.text,
        startSeconds: neighborChunk.startSeconds,
        endSeconds: neighborChunk.endSeconds,
        score: Number(Math.max(match.score - 0.08, 0.01).toFixed(6)),
      });
    }
  }

  return sortMatchesByChunkIndex([...matchByIndex.values()]);
}

async function retrieveTranscriptMatches(
  task: AnalysisTask,
  recentMessages: AnalysisChatMessage[],
  latestMessage: string,
): Promise<RetrievalSelection> {
  const rewrittenQuery = buildRetrievalQuery(task, recentMessages, latestMessage);
  const fallbackDebug: AnalysisChatRetrievalDebug = {
    rewrittenQuery,
    candidateCount: 0,
    selectedCount: 0,
    fallbackUsed: true,
  };
  const embeddingProvider = createEmbeddingProvider();
  if (!embeddingProvider.isConfigured()) {
    return {
      matches: [],
      debug: fallbackDebug,
    };
  }

  const repository = getTranscriptChunkRepository();

  try {
    const queryEmbedding = await embeddingProvider.embedText(rewrittenQuery);
    const candidateMatches = await repository.matchForAnalysis({
      analysisId: task.id,
      userId: task.userId,
      queryEmbedding,
      limit: RETRIEVAL_CANDIDATE_LIMIT,
    });
    const rerankedMatches = rerankMatches(rewrittenQuery, candidateMatches);
    const expandedMatches = expandNeighborMatches(task, rerankedMatches);

    return {
      matches: expandedMatches,
      debug: {
        rewrittenQuery,
        candidateCount: candidateMatches.length,
        selectedCount: expandedMatches.length,
        fallbackUsed: false,
      },
    };
  } catch (error) {
    console.warn(
      `[analysis] Transcript retrieval failed for analysis ${task.id}. Falling back to static transcript excerpt.`,
      error,
    );

    return {
      matches: [],
      debug: fallbackDebug,
    };
  }
}

async function buildAnalysisChatContext(
  id: string,
  task: AnalysisTask,
  recentMessages: AnalysisChatMessage[],
  latestMessage: string,
): Promise<AnalysisChatContextBuildResult> {
  if (!task.result || !task.transcript) {
    throw new ConflictError(
      "Wait for the video analysis to complete before sending chat messages.",
    );
  }

  const retrieval = await retrieveTranscriptMatches(
    task,
    recentMessages,
    latestMessage,
  );
  const storedMemoryItems = recallStoredMemoryItems(task, retrieval.debug.rewrittenQuery);
  const retrievedMemoryItems = buildRetrievedChunkMemoryItems(retrieval.matches);
  const transcriptExcerpt = retrieval.matches.length > 0
    ? buildRetrievedTranscriptExcerpt(retrieval.matches)
    : retrieval.debug.fallbackUsed
      ? buildTranscriptExcerpt(task.transcript.segments, 2400)
      : null;

  return {
    payload: {
      userId: task.userId,
      analysisId: id,
      analysisSummary: task.result.summary,
      transcriptExcerpt,
      storedConversationSummary: getChatState(task).conversationSummary,
      outline: task.result.outline,
      keyPoints: task.result.keyPoints,
      recentMessages,
      memoryItems: [
        ...buildRequestDrivenMemoryItems(task),
        ...retrievedMemoryItems,
      ],
      storedMemoryItems,
    },
    retrievalDebug: retrieval.debug,
    citations: buildCitations(retrieval.matches),
  };
}

function buildChatRuntimeState(
  pythonResponse: Awaited<ReturnType<typeof requestPythonChatAnswer>>,
  retrievalDebug: AnalysisChatRetrievalDebug,
  citations: AnalysisChatCitation[],
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
    citations,
    retrievalDebug,
  };
}

function buildUpdatedAnalysisResult(
  task: AnalysisTask,
  pythonResponse: Awaited<ReturnType<typeof requestPythonChatAnswer>>,
) {
  if (!task.result) {
    return task.result;
  }

  return {
    ...task.result,
    chatState: {
      conversationSummary:
        pythonResponse.conversationSummary ?? getChatState(task).conversationSummary,
      memoryItems: mergeStoredMemoryItems(
        getChatState(task).memoryItems,
        pythonResponse.memoryUpdates,
      ),
    },
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
    context.payload,
  );
  const pythonResponse = await requestPythonChatAnswer(pythonRequest);

  const assistantMessage = createAssistantMessage(
    trimText(pythonResponse.answer, 480),
  );
  const updatedTask = await repository.update(id, {
    chatMessages: [...task.chatMessages, userMessage, assistantMessage],
    result: buildUpdatedAnalysisResult(task, pythonResponse),
  });

  if (!updatedTask) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return {
    ...toPublicAnalysisTask(updatedTask),
    chatRuntime: buildChatRuntimeState(
      pythonResponse,
      context.retrievalDebug,
      context.citations,
    ),
  };
}
