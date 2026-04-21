import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import {
  getRetrievalCandidateLimit,
  getRetrievalDenseWeight,
  getRetrievalFinalLimit,
  getRetrievalLexicalWeight,
  getRetrievalNeighborWindow,
  getRetrievalScoreThreshold,
  getRetrievalSparseCandidateLimit,
  getRetrievalSparseWeight,
  isRetrievalQueryRewriteEnabled,
} from "@/lib/analysis/env";
import { getAnalysisMemoryStoreRepository } from "@/lib/analysis/memory-store-repository";
import { createEmbeddingProvider } from "@/lib/analysis/providers/embedding";
import {
  extractMetadataFilterFromQuery,
  computeLexicalScore,
  normalizeScores,
  tokenizeRetrievalText,
} from "@/lib/analysis/retrieval";
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
  AnalysisChatState,
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
  PythonChatResponse,
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
const RETRIEVAL_SPARSE_CANDIDATE_LIMIT = getRetrievalSparseCandidateLimit();
const RETRIEVAL_FINAL_LIMIT = getRetrievalFinalLimit();
const RETRIEVAL_NEIGHBOR_WINDOW = getRetrievalNeighborWindow();
const RETRIEVAL_SCORE_THRESHOLD = getRetrievalScoreThreshold();
const STORED_MEMORY_LIMIT = 4;
const RETRIEVAL_WEIGHT_CONFIG = {
  dense: getRetrievalDenseWeight(),
  sparse: getRetrievalSparseWeight(),
  lexical: getRetrievalLexicalWeight(),
};

function normalizeFusionWeights(weights: typeof RETRIEVAL_WEIGHT_CONFIG) {
  const total = weights.dense + weights.sparse + weights.lexical;
  if (total <= 0) {
    return {
      dense: 1 / 3,
      sparse: 1 / 3,
      lexical: 1 / 3,
    };
  }

  return {
    dense: weights.dense / total,
    sparse: weights.sparse / total,
    lexical: weights.lexical / total,
  };
}

const RETRIEVAL_FUSION_WEIGHTS = normalizeFusionWeights(RETRIEVAL_WEIGHT_CONFIG);

type RetrievalSelection = {
  matches: TranscriptChunkMatch[];
  debug: AnalysisChatRetrievalDebug;
};

type AnalysisChatContextBuildResult = {
  payload: AnalysisChatContextPayload;
  retrievalDebug: AnalysisChatRetrievalDebug;
  citations: AnalysisChatCitation[];
};

export type PreparedAnalysisChatTurn = {
  id: string;
  task: AnalysisTask;
  chatState: AnalysisChatState;
  userMessage: AnalysisChatMessage;
  context: AnalysisChatContextBuildResult;
  pythonRequest: PythonChatRequest;
};

function resolveTranscriptDurationSeconds(task: AnalysisTask) {
  const transcriptEnd =
    task.transcript?.segments.reduce<number | null>((latest, segment) => {
      const segmentEnd = segment.endSeconds ?? segment.startSeconds;
      if (typeof segmentEnd !== "number" || !Number.isFinite(segmentEnd)) {
        return latest;
      }

      return latest === null ? segmentEnd : Math.max(latest, segmentEnd);
    }, null) ?? null;

  return transcriptEnd ?? task.video.durationSeconds ?? null;
}

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

function createEmptyChatState(): AnalysisChatState {
  return {
    conversationSummary: null,
    memoryItems: [],
  };
}

function hasStoredChatState(state: AnalysisChatState) {
  return Boolean(state.conversationSummary) || state.memoryItems.length > 0;
}

async function resolveChatState(task: AnalysisTask): Promise<AnalysisChatState> {
  const repository = getAnalysisMemoryStoreRepository();
  const persistedState = await repository.getState(task.id, task.userId);
  if (hasStoredChatState(persistedState)) {
    return persistedState;
  }

  const legacyState = task.result?.chatState ?? createEmptyChatState();
  if (!hasStoredChatState(legacyState)) {
    return persistedState;
  }

  await repository.replaceState({
    analysisId: task.id,
    userId: task.userId,
    state: legacyState,
  });

  return legacyState;
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
  chatState: AnalysisChatState,
  query: string,
): PythonChatMemoryItem[] {
  const storedItems = chatState.memoryItems;
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
      recalledFrom: "memory_store",
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
  const latestTokens = tokenizeRetrievalText(latestMessage);
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

function fuseRetrievedMatches(
  query: string,
  denseMatches: TranscriptChunkMatch[],
  sparseMatches: TranscriptChunkMatch[],
) {
  const denseEntries = normalizeScores(denseMatches);
  const sparseEntries = normalizeScores(sparseMatches);
  const denseById = new Map(denseEntries.map((entry) => [entry.id, entry]));
  const sparseById = new Map(sparseEntries.map((entry) => [entry.id, entry]));
  const allMatches = new Map<string, TranscriptChunkMatch>();

  denseMatches.forEach((match) => {
    allMatches.set(match.id, match);
  });
  sparseMatches.forEach((match) => {
    allMatches.set(match.id, match);
  });

  // Weighted fusion keeps semantic recall while letting exact terminology lift relevant chunks.
  const fused = [...allMatches.values()]
    .map((match) => {
      const denseScore = denseById.get(match.id)?.normalizedScore ?? 0;
      const sparseScore = sparseById.get(match.id)?.normalizedScore ?? 0;
      const lexicalScore = computeLexicalScore(query, match.text);
      const combinedScore =
        denseScore * RETRIEVAL_FUSION_WEIGHTS.dense +
        sparseScore * RETRIEVAL_FUSION_WEIGHTS.sparse +
        lexicalScore * RETRIEVAL_FUSION_WEIGHTS.lexical;

      return {
        match,
        combinedScore,
      };
    })
    .sort((left, right) => right.combinedScore - left.combinedScore);

  const filtered = fused.filter(
    (entry) => entry.combinedScore >= RETRIEVAL_SCORE_THRESHOLD,
  );
  const selected = (filtered.length > 0 ? filtered : fused)
    .slice(0, RETRIEVAL_FINAL_LIMIT)
    .map((entry) => ({
      ...entry.match,
      score: Number(entry.combinedScore.toFixed(6)),
    }));

  return {
    selected,
    candidateCount: fused.length,
  };
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
  const metadataFilter = extractMetadataFilterFromQuery(
    rewrittenQuery,
    resolveTranscriptDurationSeconds(task),
  );
  const embeddingProvider = createEmbeddingProvider();
  const vectorSearchEnabled = embeddingProvider.isConfigured();
  const lexicalSearchEnabled = tokenizeRetrievalText(rewrittenQuery).length > 0;
  const fallbackDebug: AnalysisChatRetrievalDebug = {
    rewrittenQuery,
    denseCandidateCount: 0,
    sparseCandidateCount: 0,
    hybridCandidateCount: 0,
    selectedCount: 0,
    fallbackUsed: true,
    vectorSearchEnabled,
    lexicalSearchEnabled,
    fusionStrategy: "dense_sparse_weighted",
    metadataFilter,
  };
  if (!vectorSearchEnabled && !lexicalSearchEnabled) {
    return {
      matches: [],
      debug: fallbackDebug,
    };
  }

  const repository = getTranscriptChunkRepository();
  let denseMatches: TranscriptChunkMatch[] = [];
  let sparseMatches: TranscriptChunkMatch[] = [];

  try {
    if (vectorSearchEnabled) {
      try {
        const queryEmbedding = await embeddingProvider.embedText(rewrittenQuery);
        denseMatches = await repository.matchForAnalysis({
          analysisId: task.id,
          userId: task.userId,
          queryEmbedding,
          limit: RETRIEVAL_CANDIDATE_LIMIT,
          metadataFilter,
        });
      } catch (error) {
        console.warn(
          `[analysis] Dense transcript retrieval failed for analysis ${task.id}.`,
          error,
        );
      }
    }

    if (lexicalSearchEnabled) {
      try {
        sparseMatches = await repository.searchForAnalysis({
          analysisId: task.id,
          userId: task.userId,
          queryText: rewrittenQuery,
          limit: RETRIEVAL_SPARSE_CANDIDATE_LIMIT,
          metadataFilter,
        });
      } catch (error) {
        console.warn(
          `[analysis] Sparse transcript retrieval failed for analysis ${task.id}.`,
          error,
        );
      }
    }

    const fusedSelection = fuseRetrievedMatches(
      rewrittenQuery,
      denseMatches,
      sparseMatches,
    );
    const expandedMatches = expandNeighborMatches(task, fusedSelection.selected);
    const fallbackUsed = expandedMatches.length === 0;

    return {
      matches: expandedMatches,
      debug: {
        rewrittenQuery,
        denseCandidateCount: denseMatches.length,
        sparseCandidateCount: sparseMatches.length,
        hybridCandidateCount: fusedSelection.candidateCount,
        selectedCount: expandedMatches.length,
        fallbackUsed,
        vectorSearchEnabled,
        lexicalSearchEnabled,
        fusionStrategy: "dense_sparse_weighted",
        metadataFilter,
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
  chatState: AnalysisChatState,
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
  const storedMemoryItems = recallStoredMemoryItems(
    chatState,
    retrieval.debug.rewrittenQuery,
  );
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
      storedConversationSummary: chatState.conversationSummary,
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
  chatState: AnalysisChatState,
  pythonResponse: Awaited<ReturnType<typeof requestPythonChatAnswer>>,
  retrievalDebug: AnalysisChatRetrievalDebug,
  citations: AnalysisChatCitation[],
): AnalysisChatRuntimeState {
  return {
    memoryHits: pythonResponse.memoryHits,
    conversationSummary: chatState.conversationSummary,
    memoryItems: chatState.memoryItems.map((item) => ({
      kind: item.kind,
      content: item.content,
      source: item.source ?? null,
      metadata: item.metadata ?? {},
    })),
    citations,
    retrievalDebug,
  };
}

function buildUpdatedAnalysisResult(
  task: AnalysisTask,
  chatState: AnalysisChatState,
  pythonResponse: Awaited<ReturnType<typeof requestPythonChatAnswer>>,
) {
  if (!task.result) {
    return task.result;
  }

  return {
    ...task.result,
    chatState: {
      conversationSummary:
        pythonResponse.conversationSummary ?? chatState.conversationSummary,
      memoryItems: mergeStoredMemoryItems(
        chatState.memoryItems,
        pythonResponse.memoryUpdates,
      ),
    },
  };
}

export async function chatOnAnalysis(
  id: string,
  input: ChatInput,
): Promise<AnalysisPublicTask> {
  const preparedTurn = await prepareAnalysisChatTurn(id, input);
  const pythonResponse = await requestPythonChatAnswer(preparedTurn.pythonRequest);

  return finalizeAnalysisChatTurn(preparedTurn, pythonResponse);
}

export async function prepareAnalysisChatTurn(
  id: string,
  input: ChatInput,
): Promise<PreparedAnalysisChatTurn> {
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

  const chatState = await resolveChatState(task);
  const userMessage = createUserMessage(trimText(message, 500));
  const context = await buildAnalysisChatContext(
    id,
    task,
    chatState,
    [...task.chatMessages, userMessage],
    userMessage.content,
  );
  const pythonRequest = buildPythonChatRequest(
    userMessage.content,
    context.payload,
  );

  return {
    id,
    task,
    chatState,
    userMessage,
    context,
    pythonRequest,
  };
}

export async function finalizeAnalysisChatTurn(
  preparedTurn: PreparedAnalysisChatTurn,
  pythonResponse: PythonChatResponse,
): Promise<AnalysisPublicTask> {
  const repository = getAnalysisRepository();
  const nextResult = buildUpdatedAnalysisResult(
    preparedTurn.task,
    preparedTurn.chatState,
    pythonResponse,
  );
  const nextChatState = nextResult?.chatState ?? createEmptyChatState();
  await getAnalysisMemoryStoreRepository().replaceState({
    analysisId: preparedTurn.id,
    userId: preparedTurn.task.userId,
    state: nextChatState,
  });

  const assistantMessage = createAssistantMessage(
    trimText(pythonResponse.answer, 480),
  );
  const updatedTask = await repository.update(preparedTurn.id, {
    chatMessages: [
      ...preparedTurn.task.chatMessages,
      preparedTurn.userMessage,
      assistantMessage,
    ],
    result: nextResult,
  });

  if (!updatedTask) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return {
    ...toPublicAnalysisTask(updatedTask),
    chatRuntime: buildChatRuntimeState(
      nextChatState,
      pythonResponse,
      preparedTurn.context.retrievalDebug,
      preparedTurn.context.citations,
    ),
  };
}
