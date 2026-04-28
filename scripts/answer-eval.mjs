import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_DENSE_LIMIT = 12;
const DEFAULT_SPARSE_LIMIT = 10;
const DEFAULT_FINAL_LIMIT = 5;
const DEFAULT_TOP_K = [1, 3, 5];
const DEFAULT_RETRIEVAL_DENSE_WEIGHT = 0.65;
const DEFAULT_RETRIEVAL_SPARSE_WEIGHT = 0.1;
const DEFAULT_RETRIEVAL_LEXICAL_WEIGHT = 0.25;
const DEFAULT_PYTHON_TIMEOUT_MS = 20_000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const REFUSAL_MARKERS = [
  "not enough context",
  "insufficient context",
  "does not mention",
  "doesn't mention",
  "not provided",
  "cannot determine",
  "can't determine",
  "i don't know",
  "i cannot answer",
  "the video does not",
  "context is insufficient",
  "没有提到",
  "未提到",
  "没有说明",
  "未说明",
  "无法判断",
  "无法确定",
  "不能确定",
  "上下文不足",
  "信息不足",
  "没有相关信息",
  "无法从",
];

function printUsage() {
  console.log(`Usage:
  npm run eval:answer -- --dataset scripts/answer-eval.template.json
  npm run eval:answer -- --dataset scripts/my-answer-eval.json --output .tmp/answer-eval-report.json

Required env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  PYTHON_BACKEND_BASE_URL

Optional env:
  EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL
  EVAL_INPUT_COST_PER_1K / EVAL_OUTPUT_COST_PER_1K`);
}

function parseArgs(argv) {
  const options = {
    dataset: null,
    output: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--dataset") {
      options.dataset = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return options;
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/u, "$2");

      process.env[key] = value;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function normalizeForMatch(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function buildAsciiTokens(value) {
  return value.match(/[a-z0-9]+/gu)?.filter((token) => token.length >= 2) ?? [];
}

function buildCjkBigrams(value) {
  const characters = value.match(/[\u4e00-\u9fff]/gu) ?? [];
  if (characters.length <= 1) {
    return characters;
  }

  const bigrams = [];
  for (let index = 0; index < characters.length - 1; index += 1) {
    bigrams.push(`${characters[index]}${characters[index + 1]}`);
  }

  return bigrams;
}

function tokenizeRetrievalText(value) {
  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return [];
  }

  return [...buildAsciiTokens(normalized), ...buildCjkBigrams(normalized)];
}

function computeLexicalScore(query, text) {
  const queryTokens = new Set(tokenizeRetrievalText(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const textTokens = new Set(tokenizeRetrievalText(text));
  let overlap = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

function buildTokenFrequency(tokens) {
  const frequencies = new Map();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

function computeSparseScores(query, documents) {
  const queryTokens = [...new Set(tokenizeRetrievalText(query))];
  if (queryTokens.length === 0 || documents.length === 0) {
    return [];
  }

  const preparedDocuments = documents.map((document) => {
    const tokens = tokenizeRetrievalText(document.text);
    return {
      ...document,
      tokens,
      tokenFrequency: buildTokenFrequency(tokens),
      uniqueTokens: new Set(tokens),
      documentLength: Math.max(tokens.length, 1),
    };
  });
  const averageDocumentLength =
    preparedDocuments.reduce((total, document) => total + document.documentLength, 0) /
    preparedDocuments.length;

  return preparedDocuments
    .map((document) => {
      let score = 0;

      for (const token of queryTokens) {
        const termFrequency = document.tokenFrequency.get(token) ?? 0;
        if (termFrequency <= 0) {
          continue;
        }

        const documentFrequency = preparedDocuments.reduce(
          (count, current) => count + (current.uniqueTokens.has(token) ? 1 : 0),
          0,
        );
        const inverseDocumentFrequency = Math.log(
          1 + (preparedDocuments.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
        );
        const numerator = termFrequency * (BM25_K1 + 1);
        const denominator =
          termFrequency +
          BM25_K1 *
            (1 - BM25_B + BM25_B * (document.documentLength / averageDocumentLength));

        score += inverseDocumentFrequency * (numerator / denominator);
      }

      return {
        item: document.item,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function normalizeScores(entries) {
  if (entries.length === 0) {
    return [];
  }

  const scores = entries.map((entry) => entry.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  return entries.map((entry) => ({
    ...entry,
    normalizedScore:
      maxScore === minScore
        ? entry.score > 0
          ? 1
          : 0
        : (entry.score - minScore) / (maxScore - minScore),
  }));
}

function coerceNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeFusionWeights(dataset) {
  const dense = Number(
    dataset.retrievalWeights?.dense ??
      process.env.RETRIEVAL_DENSE_WEIGHT ??
      DEFAULT_RETRIEVAL_DENSE_WEIGHT,
  );
  const sparse = Number(
    dataset.retrievalWeights?.sparse ??
      process.env.RETRIEVAL_SPARSE_WEIGHT ??
      DEFAULT_RETRIEVAL_SPARSE_WEIGHT,
  );
  const lexical = Number(
    dataset.retrievalWeights?.lexical ??
      process.env.RETRIEVAL_LEXICAL_WEIGHT ??
      DEFAULT_RETRIEVAL_LEXICAL_WEIGHT,
  );
  const total = dense + sparse + lexical;

  if (!Number.isFinite(total) || total <= 0) {
    return {
      dense: 1 / 3,
      sparse: 1 / 3,
      lexical: 1 / 3,
    };
  }

  return {
    dense: dense / total,
    sparse: sparse / total,
    lexical: lexical / total,
  };
}

function validateStringArray(value, label, queryIndex) {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Query #${queryIndex + 1} ${label} must be a string array.`);
  }
}

function validateNumberArray(value, label, queryIndex) {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
    throw new Error(`Query #${queryIndex + 1} ${label} must be an integer array.`);
  }
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object") {
    throw new Error("The dataset file must contain a JSON object.");
  }

  if (!Array.isArray(dataset.queries) || dataset.queries.length === 0) {
    throw new Error("The dataset must include at least one query.");
  }

  const hasDatasetAnalysisId =
    typeof dataset.analysisId === "string" && dataset.analysisId.trim();
  const hasDatasetUserId =
    typeof dataset.userId === "string" && dataset.userId.trim();

  dataset.queries.forEach((query, index) => {
    const hasQueryAnalysisId =
      typeof query.analysisId === "string" && query.analysisId.trim();
    const hasQueryUserId =
      typeof query.userId === "string" && query.userId.trim();

    if (!hasDatasetAnalysisId && !hasQueryAnalysisId) {
      throw new Error(
        `Query #${index + 1} must include analysisId because the dataset does not define a default one.`,
      );
    }

    if (!hasDatasetUserId && !hasQueryUserId) {
      throw new Error(
        `Query #${index + 1} must include userId because the dataset does not define a default one.`,
      );
    }

    if (typeof query.query !== "string" || !query.query.trim()) {
      throw new Error(`Query #${index + 1} is missing a non-empty query string.`);
    }

    validateNumberArray(query.expectedChunkIndexes, "expectedChunkIndexes", index);
    validateNumberArray(query.allowedCitationChunkIndexes, "allowedCitationChunkIndexes", index);
    validateStringArray(query.expectedAnswerContains, "expectedAnswerContains", index);
    validateStringArray(query.forbiddenAnswerContains, "forbiddenAnswerContains", index);
  });
}

async function readDataset(datasetPath) {
  const absolutePath = path.resolve(datasetPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const dataset = JSON.parse(raw);
  validateDataset(dataset);

  return {
    dataset,
    absolutePath,
  };
}

function resolveQueryScope(dataset, queryDefinition) {
  const datasetAnalysisId =
    typeof dataset.analysisId === "string" ? dataset.analysisId.trim() : "";
  const datasetUserId =
    typeof dataset.userId === "string" ? dataset.userId.trim() : "";
  const analysisId =
    typeof queryDefinition.analysisId === "string" && queryDefinition.analysisId.trim()
      ? queryDefinition.analysisId.trim()
      : datasetAnalysisId;
  const userId =
    typeof queryDefinition.userId === "string" && queryDefinition.userId.trim()
      ? queryDefinition.userId.trim()
      : datasetUserId;

  return {
    analysisId,
    userId,
  };
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Load them in .env.local first.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function resolveEmbeddingsUrl(baseUrl) {
  const url = new URL(baseUrl);
  const trimmedPath = url.pathname.replace(/\/$/u, "");

  if (trimmedPath === "" || trimmedPath === "/" || trimmedPath.endsWith("/v1")) {
    url.pathname = `${trimmedPath}/embeddings`.replace("//", "/");
  }

  return url.toString();
}

async function fetchQueryEmbedding(query) {
  const baseUrl = process.env.EMBEDDING_BASE_URL?.trim();
  const apiKey = process.env.EMBEDDING_API_KEY?.trim();
  const model = process.env.EMBEDDING_MODEL?.trim();

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(resolveEmbeddingsUrl(baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: query,
        }),
      });
      const rawBody = await response.text();
      const body = rawBody ? JSON.parse(rawBody) : null;

      if (!response.ok) {
        const errorMessage =
          body &&
          typeof body === "object" &&
          body.error &&
          typeof body.error === "object" &&
          typeof body.error.message === "string"
            ? body.error.message
            : `Embedding request failed with status ${response.status}.`;
        throw new Error(errorMessage);
      }

      const embedding = body?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("The embedding service did not return a usable embedding.");
      }

      return embedding;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildRpcMetadataFilter(queryDefinition) {
  const filter = queryDefinition.metadataFilter;
  if (!filter || typeof filter !== "object") {
    return {
      filter_start_seconds: null,
      filter_end_seconds: null,
    };
  }

  return {
    filter_start_seconds: coerceNumber(filter.startSeconds),
    filter_end_seconds: coerceNumber(filter.endSeconds),
  };
}

function chunkMatchesMetadataFilter(chunk, queryDefinition) {
  const filter = queryDefinition.metadataFilter;
  if (!filter || typeof filter !== "object") {
    return true;
  }

  const filterStart = coerceNumber(filter.startSeconds) ?? 0;
  const filterEnd = coerceNumber(filter.endSeconds) ?? Number.POSITIVE_INFINITY;
  const chunkStart = coerceNumber(chunk.startSeconds ?? chunk.start_seconds ?? null);
  const chunkEnd = coerceNumber(chunk.endSeconds ?? chunk.end_seconds ?? null);
  if (chunkStart === null && chunkEnd === null) {
    return false;
  }

  const effectiveStart = chunkStart ?? chunkEnd ?? 0;
  const effectiveEnd = Math.max(chunkEnd ?? effectiveStart, effectiveStart);
  return effectiveEnd >= filterStart && effectiveStart <= filterEnd;
}

async function fetchAnalysisRecord(supabase, dataset, queryDefinition) {
  const scope = resolveQueryScope(dataset, queryDefinition);
  const { data, error } = await supabase
    .from("analysis_records")
    .select("id, user_id, status, video, transcript, result, chat_messages")
    .eq("id", scope.analysisId)
    .eq("user_id", scope.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Could not find analysis ${scope.analysisId} for user ${scope.userId}.`);
  }

  if (data.status !== "completed") {
    throw new Error(`Analysis ${scope.analysisId} is ${data.status}; answer eval requires completed.`);
  }

  if (!data.result || !data.transcript) {
    throw new Error(`Analysis ${scope.analysisId} is missing result or transcript.`);
  }

  return data;
}

async function runDenseRetrieval(supabase, dataset, queryDefinition, limit) {
  const scope = resolveQueryScope(dataset, queryDefinition);
  const queryEmbedding = await fetchQueryEmbedding(queryDefinition.query);
  if (!queryEmbedding) {
    return {
      enabled: false,
      matches: [],
    };
  }

  const { data, error } = await supabase.rpc("match_analysis_transcript_chunks", {
    filter_analysis_id: scope.analysisId,
    filter_user_id: scope.userId,
    query_embedding: queryEmbedding,
    match_count: limit,
    ...buildRpcMetadataFilter(queryDefinition),
  });

  if (error) {
    throw error;
  }

  return {
    enabled: true,
    matches: (data ?? []).map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      text: row.text,
      startSeconds: coerceNumber(row.start_seconds),
      endSeconds: coerceNumber(row.end_seconds),
      score: coerceNumber(row.score) ?? 0,
    })),
  };
}

async function runSparseRetrieval(supabase, dataset, queryDefinition, limit) {
  const scope = resolveQueryScope(dataset, queryDefinition);
  const { data, error } = await supabase.rpc("search_analysis_transcript_chunks", {
    filter_analysis_id: scope.analysisId,
    filter_user_id: scope.userId,
    query_text: queryDefinition.query,
    match_count: limit,
    ...buildRpcMetadataFilter(queryDefinition),
  });

  if (error) {
    throw error;
  }

  const remoteMatches = (data ?? []).map((row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    text: row.text,
    startSeconds: coerceNumber(row.start_seconds),
    endSeconds: coerceNumber(row.end_seconds),
    score: coerceNumber(row.score) ?? 0,
  }));

  if (remoteMatches.length > 0) {
    return remoteMatches;
  }

  const { data: chunkRows, error: chunkError } = await supabase
    .from("analysis_transcript_chunks")
    .select("id, chunk_index, text, start_seconds, end_seconds")
    .eq("analysis_id", scope.analysisId)
    .eq("user_id", scope.userId)
    .order("chunk_index", { ascending: true });

  if (chunkError) {
    throw chunkError;
  }

  const scoredRows = computeSparseScores(
    queryDefinition.query,
    (chunkRows ?? [])
      .filter((row) => chunkMatchesMetadataFilter(row, queryDefinition))
      .map((row) => ({
        item: row,
        text: row.text,
      })),
  );

  return scoredRows.slice(0, limit).map(({ item, score }) => ({
    id: item.id,
    chunkIndex: item.chunk_index,
    text: item.text,
    startSeconds: coerceNumber(item.start_seconds),
    endSeconds: coerceNumber(item.end_seconds),
    score,
  }));
}

function fuseRetrievedMatches(dataset, query, denseMatches, sparseMatches) {
  const weights = normalizeFusionWeights(dataset);
  const denseEntries = normalizeScores(denseMatches);
  const sparseEntries = normalizeScores(sparseMatches);
  const denseById = new Map(denseEntries.map((entry) => [entry.id, entry]));
  const sparseById = new Map(sparseEntries.map((entry) => [entry.id, entry]));
  const allMatches = new Map();

  for (const match of denseMatches) {
    allMatches.set(match.id, match);
  }
  for (const match of sparseMatches) {
    allMatches.set(match.id, match);
  }

  return [...allMatches.values()]
    .map((match) => {
      const denseScore = denseById.get(match.id)?.normalizedScore ?? 0;
      const sparseScore = sparseById.get(match.id)?.normalizedScore ?? 0;
      const lexicalScore = computeLexicalScore(query, match.text);

      return {
        ...match,
        score:
          denseScore * weights.dense +
          sparseScore * weights.sparse +
          lexicalScore * weights.lexical,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function evaluateRanking(ranking, expectedChunkIndexes, topKValues) {
  const relevant = new Set(expectedChunkIndexes);
  const firstRelevantRank = ranking.findIndex((entry) => relevant.has(entry.chunkIndex));
  const metrics = {};

  for (const k of topKValues) {
    const topEntries = ranking.slice(0, k);
    const hitCount = topEntries.filter((entry) => relevant.has(entry.chunkIndex)).length;
    metrics[`recall@${k}`] = relevant.size === 0 ? null : hitCount / relevant.size;
    metrics[`hit@${k}`] = relevant.size === 0 ? null : hitCount > 0 ? 1 : 0;
  }

  return {
    metrics,
    mrr: relevant.size === 0 ? null : firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1),
  };
}

function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function trimText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildTranscriptExcerptFromMatches(matches) {
  return trimText(
    [...matches]
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
      .map((match) => {
        const time = formatTimestamp(match.startSeconds);
        return time ? `[${time}] ${match.text}` : match.text;
      })
      .join(" "),
    2400,
  );
}

function buildFallbackTranscriptExcerpt(record) {
  const segments = Array.isArray(record.transcript?.segments)
    ? record.transcript.segments
    : [];
  return trimText(
    segments
      .slice(0, 18)
      .map((segment) => {
        const time = formatTimestamp(segment.startSeconds);
        return time ? `[${time}] ${segment.text}` : segment.text;
      })
      .join(" "),
    2400,
  );
}

function buildCitations(matches) {
  return [...matches]
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .map((match) => ({
      chunkIndex: match.chunkIndex,
      text: match.text,
      score: Number(match.score.toFixed(6)),
      startSeconds: match.startSeconds,
      endSeconds: match.endSeconds,
    }));
}

function buildMemoryItems(record, matches) {
  const result = record.result ?? {};
  const memoryItems = [];

  if (typeof result.summary === "string" && result.summary.trim()) {
    memoryItems.push({
      kind: "analysis_summary",
      content: result.summary,
      source: "analysis.result.summary",
      metadata: {
        scope: "long_term",
      },
    });
  }

  for (const [index, keyPoint] of (Array.isArray(result.keyPoints) ? result.keyPoints : [])
    .slice(0, 6)
    .entries()) {
    memoryItems.push({
      kind: "key_point",
      content: keyPoint,
      source: "analysis.result.keyPoints",
      metadata: {
        scope: "long_term",
        index,
      },
    });
  }

  for (const [index, item] of (Array.isArray(result.outline) ? result.outline : [])
    .slice(0, 8)
    .entries()) {
    const content = item.time ? `[${item.time}] ${item.text}` : item.text;
    memoryItems.push({
      kind: "outline_item",
      content,
      source: "analysis.result.outline",
      metadata: {
        scope: "long_term",
        index,
        time: item.time ?? null,
      },
    });
  }

  for (const match of [...matches].sort((left, right) => left.chunkIndex - right.chunkIndex)) {
    memoryItems.push({
      kind: "retrieved_chunk",
      content: match.text,
      source: "analysis.transcript_chunks",
      metadata: {
        chunkIndex: match.chunkIndex,
        score: Number(match.score.toFixed(6)),
        startSeconds: match.startSeconds,
        endSeconds: match.endSeconds,
      },
    });
  }

  return memoryItems;
}

function normalizeRecentMessages(queryDefinition) {
  if (!Array.isArray(queryDefinition.recentMessages)) {
    return [];
  }

  return queryDefinition.recentMessages
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .slice(-8);
}

function buildPythonChatRequest(record, queryDefinition, matches) {
  const result = record.result ?? {};
  const transcriptExcerpt =
    matches.length > 0
      ? buildTranscriptExcerptFromMatches(matches)
      : buildFallbackTranscriptExcerpt(record);
  const recentMessages = [
    ...normalizeRecentMessages(queryDefinition),
    {
      role: "user",
      content: queryDefinition.query,
    },
  ];

  return {
    userId: record.user_id,
    analysisId: record.id,
    analysisSummary: typeof result.summary === "string" ? result.summary : null,
    transcriptExcerpt: transcriptExcerpt || null,
    storedConversationSummary:
      typeof queryDefinition.storedConversationSummary === "string"
        ? queryDefinition.storedConversationSummary
        : null,
    outline: Array.isArray(result.outline) ? result.outline : [],
    keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
    message: queryDefinition.query,
    recentMessages,
    memoryItems: buildMemoryItems(record, matches),
    storedMemoryItems: Array.isArray(queryDefinition.storedMemoryItems)
      ? queryDefinition.storedMemoryItems
      : [],
  };
}

function resolvePythonBackendBaseUrl(dataset) {
  const baseUrl =
    typeof dataset.pythonBackendBaseUrl === "string" && dataset.pythonBackendBaseUrl.trim()
      ? dataset.pythonBackendBaseUrl.trim()
      : process.env.PYTHON_BACKEND_BASE_URL?.trim();

  if (!baseUrl) {
    throw new Error("Missing PYTHON_BACKEND_BASE_URL. Start the Python backend and set the env var.");
  }

  return new URL(baseUrl).toString();
}

function resolvePythonBackendTimeoutMs(dataset) {
  const value =
    dataset.pythonBackendTimeoutMs ??
    process.env.PYTHON_BACKEND_TIMEOUT_MS ??
    process.env.PYTHON_CHAT_TIMEOUT_MS ??
    DEFAULT_PYTHON_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_PYTHON_TIMEOUT_MS;
}

async function requestPythonChatAnswer(dataset, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolvePythonBackendTimeoutMs(dataset),
  );
  const startedAt = performance.now();

  try {
    const response = await fetch(new URL("/api/chat/respond", resolvePythonBackendBaseUrl(dataset)), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const rawBody = await response.text();
    const body = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
      const message =
        typeof body?.detail === "string"
          ? body.detail
          : typeof body?.error?.message === "string"
            ? body.error.message
            : `Python chat service returned status ${response.status}.`;
      throw new Error(message);
    }

    if (!body || typeof body.answer !== "string") {
      throw new Error("Python chat service returned an invalid answer payload.");
    }

    return {
      latencyMs,
      response: {
        answer: body.answer.trim(),
        memoryItems: Array.isArray(body.memoryItems) ? body.memoryItems : body.memory_items ?? [],
        memoryUpdates: Array.isArray(body.memoryUpdates)
          ? body.memoryUpdates
          : body.memory_updates ?? [],
        memoryHits: Array.isArray(body.memoryHits) ? body.memoryHits : body.memory_hits ?? [],
        conversationSummary:
          typeof body.conversationSummary === "string"
            ? body.conversationSummary
            : typeof body.conversation_summary === "string"
              ? body.conversation_summary
              : null,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function includesNormalized(haystack, needle) {
  const normalizedNeedle = normalizeForMatch(needle);
  return Boolean(normalizedNeedle) && normalizeForMatch(haystack).includes(normalizedNeedle);
}

function evaluateTermCoverage(answer, expectedTerms) {
  const terms = Array.isArray(expectedTerms) ? expectedTerms : [];
  if (terms.length === 0) {
    return {
      expected: [],
      hits: [],
      misses: [],
      score: null,
    };
  }

  const hits = terms.filter((term) => includesNormalized(answer, term));
  const misses = terms.filter((term) => !includesNormalized(answer, term));
  return {
    expected: terms,
    hits,
    misses,
    score: hits.length / terms.length,
  };
}

function evaluateForbiddenTerms(answer, forbiddenTerms) {
  const terms = Array.isArray(forbiddenTerms) ? forbiddenTerms : [];
  const hits = terms.filter((term) => includesNormalized(answer, term));
  return {
    expected: terms,
    hits,
    count: hits.length,
    score: hits.length === 0 ? 1 : 0,
  };
}

function detectRefusal(answer) {
  const normalized = normalizeForMatch(answer);
  return REFUSAL_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
}

function evaluateCitationQuality(citations, queryDefinition) {
  const expected = new Set(queryDefinition.expectedChunkIndexes ?? []);
  const allowed = new Set([
    ...(queryDefinition.expectedChunkIndexes ?? []),
    ...(queryDefinition.allowedCitationChunkIndexes ?? []),
  ]);
  const citedIndexes = citations.map((citation) => citation.chunkIndex);

  if (expected.size === 0 && allowed.size === 0) {
    return {
      expectedChunkIndexes: [],
      allowedCitationChunkIndexes: [],
      citedChunkIndexes: citedIndexes,
      hit: null,
      recall: null,
      precision: null,
    };
  }

  const expectedHits = citedIndexes.filter((index) => expected.has(index));
  const allowedHits = citedIndexes.filter((index) => allowed.has(index));
  return {
    expectedChunkIndexes: [...expected],
    allowedCitationChunkIndexes: [...allowed],
    citedChunkIndexes: citedIndexes,
    hit: expected.size === 0 ? null : expectedHits.length > 0 ? 1 : 0,
    recall: expected.size === 0 ? null : new Set(expectedHits).size / expected.size,
    precision: citedIndexes.length === 0 ? 0 : allowedHits.length / citedIndexes.length,
  };
}

function averageNonNull(values) {
  const numericValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

function evaluateAnswer(answer, citations, queryDefinition) {
  const requiredCoverage = evaluateTermCoverage(
    answer,
    queryDefinition.expectedAnswerContains,
  );
  const forbidden = evaluateForbiddenTerms(
    answer,
    queryDefinition.forbiddenAnswerContains,
  );
  const citationQuality = evaluateCitationQuality(citations, queryDefinition);
  const didRefuse = detectRefusal(answer);
  const expectedRefusal = queryDefinition.expectedRefusal === true;
  const refusalPass = expectedRefusal ? didRefuse && forbidden.count === 0 : !didRefuse;
  const groundednessScore = expectedRefusal
    ? refusalPass
      ? 1
      : 0
    : averageNonNull([
        requiredCoverage.score,
        forbidden.score,
        citationQuality.hit,
        citationQuality.recall,
        refusalPass ? 1 : 0,
      ]);

  return {
    requiredCoverage,
    forbidden,
    citations: citationQuality,
    refusal: {
      expected: expectedRefusal,
      detected: didRefuse,
      pass: refusalPass,
    },
    groundednessScore,
    pass: Boolean(
      (groundednessScore ?? 0) >= (queryDefinition.minGroundednessScore ?? 0.75) &&
        forbidden.count === 0 &&
        refusalPass,
    ),
  };
}

function estimateTokenCount(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return 0;
  }

  const cjkCount = text.match(/[\u4e00-\u9fff]/gu)?.length ?? 0;
  const asciiWords = text.match(/[a-zA-Z0-9_+-]+/gu)?.length ?? 0;
  const otherChars = Math.max(text.length - cjkCount, 0);
  return Math.ceil(cjkCount + asciiWords * 1.3 + otherChars / 4);
}

function resolveCostConfig(dataset) {
  const inputCostPer1K = Number(
    dataset.cost?.inputPer1KTokens ?? process.env.EVAL_INPUT_COST_PER_1K ?? NaN,
  );
  const outputCostPer1K = Number(
    dataset.cost?.outputPer1KTokens ?? process.env.EVAL_OUTPUT_COST_PER_1K ?? NaN,
  );

  if (!Number.isFinite(inputCostPer1K) || !Number.isFinite(outputCostPer1K)) {
    return null;
  }

  return {
    inputCostPer1K,
    outputCostPer1K,
  };
}

function estimateCost(dataset, payload, answer) {
  const inputTokens = estimateTokenCount(JSON.stringify(payload));
  const outputTokens = estimateTokenCount(answer);
  const costConfig = resolveCostConfig(dataset);
  const estimatedCostUsd = costConfig
    ? (inputTokens / 1000) * costConfig.inputCostPer1K +
      (outputTokens / 1000) * costConfig.outputCostPer1K
    : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd,
  };
}

function aggregateMetric(queryReports, selector) {
  return averageNonNull(queryReports.map(selector));
}

function percentile(values, percentileValue) {
  const numericValues = values
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (numericValues.length === 0) {
    return null;
  }

  const index = Math.min(
    numericValues.length - 1,
    Math.ceil((percentileValue / 100) * numericValues.length) - 1,
  );
  return numericValues[index];
}

function aggregateSummary(queryReports, topKValues) {
  const retrievalMetrics = {
    mrr: aggregateMetric(queryReports, (report) => report.retrieval.hybrid.mrr),
  };

  for (const k of topKValues) {
    retrievalMetrics[`recall@${k}`] = aggregateMetric(
      queryReports,
      (report) => report.retrieval.hybrid.metrics[`recall@${k}`],
    );
    retrievalMetrics[`hit@${k}`] = aggregateMetric(
      queryReports,
      (report) => report.retrieval.hybrid.metrics[`hit@${k}`],
    );
  }

  const refusalReports = queryReports.filter((report) => report.answer.refusal.expected);
  const totalEstimatedCost = queryReports.reduce(
    (total, report) => total + (report.cost.estimatedCostUsd ?? 0),
    0,
  );

  return {
    queryCount: queryReports.length,
    passRate: aggregateMetric(queryReports, (report) => (report.answer.pass ? 1 : 0)),
    retrieval: retrievalMetrics,
    answer: {
      groundednessScore: aggregateMetric(
        queryReports,
        (report) => report.answer.groundednessScore,
      ),
      requiredCoverage: aggregateMetric(
        queryReports,
        (report) => report.answer.requiredCoverage.score,
      ),
      forbiddenFreeRate: aggregateMetric(
        queryReports,
        (report) => (report.answer.forbidden.count === 0 ? 1 : 0),
      ),
    },
    citations: {
      hitRate: aggregateMetric(queryReports, (report) => report.answer.citations.hit),
      recall: aggregateMetric(queryReports, (report) => report.answer.citations.recall),
      precision: aggregateMetric(queryReports, (report) => report.answer.citations.precision),
    },
    refusal: {
      caseCount: refusalReports.length,
      passRate: aggregateMetric(refusalReports, (report) => (report.answer.refusal.pass ? 1 : 0)),
    },
    latency: {
      avgMs: aggregateMetric(queryReports, (report) => report.latencyMs),
      p95Ms: percentile(
        queryReports.map((report) => report.latencyMs),
        95,
      ),
    },
    cost: {
      totalEstimatedInputTokens: queryReports.reduce(
        (total, report) => total + report.cost.inputTokens,
        0,
      ),
      totalEstimatedOutputTokens: queryReports.reduce(
        (total, report) => total + report.cost.outputTokens,
        0,
      ),
      totalEstimatedTokens: queryReports.reduce(
        (total, report) => total + report.cost.totalTokens,
        0,
      ),
      totalEstimatedCostUsd: Number.isFinite(totalEstimatedCost)
        ? totalEstimatedCost
        : null,
    },
  };
}

function formatNullableMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function printSummary(summary, topKValues) {
  console.log("\nSummary:");
  console.log(`Pass rate: ${formatNullableMetric(summary.passRate)}`);
  console.log(`Groundedness: ${formatNullableMetric(summary.answer.groundednessScore)}`);
  console.log(`Citation hit rate: ${formatNullableMetric(summary.citations.hitRate)}`);
  console.log(`Citation precision: ${formatNullableMetric(summary.citations.precision)}`);
  console.log(`Refusal pass rate: ${formatNullableMetric(summary.refusal.passRate)}`);

  const retrievalParts = [`MRR=${formatNullableMetric(summary.retrieval.mrr)}`];
  for (const k of topKValues) {
    retrievalParts.push(`Recall@${k}=${formatNullableMetric(summary.retrieval[`recall@${k}`])}`);
    retrievalParts.push(`Hit@${k}=${formatNullableMetric(summary.retrieval[`hit@${k}`])}`);
  }
  console.log(`Retrieval: ${retrievalParts.join("  ")}`);
  console.log(`Latency: avg=${Math.round(summary.latency.avgMs ?? 0)}ms p95=${Math.round(summary.latency.p95Ms ?? 0)}ms`);
  console.log(`Estimated tokens: ${summary.cost.totalEstimatedTokens}`);
  if (summary.cost.totalEstimatedCostUsd !== null) {
    console.log(`Estimated cost: $${summary.cost.totalEstimatedCostUsd.toFixed(6)}`);
  }
}

function buildOutputReport(datasetPath, dataset, topKValues, queryReports, summary, warnings) {
  return {
    datasetPath,
    generatedAt: new Date().toISOString(),
    analysisId: dataset.analysisId ?? null,
    userId: dataset.userId ?? null,
    topK: topKValues,
    warnings,
    summary,
    queries: queryReports,
  };
}

async function evaluateQuery(supabase, dataset, queryDefinition, topKValues) {
  const denseLimit = Number.isInteger(dataset.denseLimit) ? dataset.denseLimit : DEFAULT_DENSE_LIMIT;
  const sparseLimit = Number.isInteger(dataset.sparseLimit)
    ? dataset.sparseLimit
    : DEFAULT_SPARSE_LIMIT;
  const finalLimit = Number.isInteger(dataset.finalLimit) ? dataset.finalLimit : DEFAULT_FINAL_LIMIT;
  const expectedChunkIndexes = queryDefinition.expectedChunkIndexes ?? [];
  const record = await fetchAnalysisRecord(supabase, dataset, queryDefinition);
  const denseResult = await runDenseRetrieval(
    supabase,
    dataset,
    queryDefinition,
    Math.max(denseLimit, ...topKValues, finalLimit),
  );
  const sparseRanking = await runSparseRetrieval(
    supabase,
    dataset,
    queryDefinition,
    Math.max(sparseLimit, ...topKValues, finalLimit),
  );
  const hybridRanking = denseResult.enabled
    ? fuseRetrievedMatches(dataset, queryDefinition.query, denseResult.matches, sparseRanking)
    : [...sparseRanking];
  const selectedMatches = hybridRanking.slice(0, finalLimit);
  const citations = buildCitations(selectedMatches);
  const pythonRequest = buildPythonChatRequest(record, queryDefinition, selectedMatches);
  const { response, latencyMs } = await requestPythonChatAnswer(dataset, pythonRequest);
  const answerEvaluation = evaluateAnswer(response.answer, citations, queryDefinition);
  const cost = estimateCost(dataset, pythonRequest, response.answer);

  return {
    id: queryDefinition.id ?? queryDefinition.query,
    query: queryDefinition.query,
    expectedChunkIndexes,
    metadataFilter: queryDefinition.metadataFilter ?? null,
    retrieval: {
      dense: denseResult.enabled
        ? evaluateRanking(denseResult.matches, expectedChunkIndexes, topKValues)
        : null,
      sparse: evaluateRanking(sparseRanking, expectedChunkIndexes, topKValues),
      hybrid: evaluateRanking(hybridRanking, expectedChunkIndexes, topKValues),
      denseEnabled: denseResult.enabled,
      topChunkIndexes: {
        dense: denseResult.matches.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
        sparse: sparseRanking.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
        hybrid: hybridRanking.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
      },
      selectedCitations: citations,
    },
    answer: {
      text: response.answer,
      ...answerEvaluation,
    },
    latencyMs,
    cost,
    memory: {
      hitCount: response.memoryHits.length,
      updateCount: response.memoryUpdates.length,
      conversationSummary: response.conversationSummary,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!options.dataset) {
    printUsage();
    throw new Error("Missing --dataset argument.");
  }

  const workspaceRoot = process.cwd();
  await loadEnvFile(path.join(workspaceRoot, ".env.local"));
  await loadEnvFile(path.join(workspaceRoot, ".env"));

  const { dataset, absolutePath } = await readDataset(options.dataset);
  const topKValues = Array.isArray(dataset.topK) && dataset.topK.length > 0
    ? [...new Set(dataset.topK.filter((value) => Number.isInteger(value) && value > 0))].sort(
        (left, right) => left - right,
      )
    : DEFAULT_TOP_K;
  const supabase = createSupabaseAdminClient();
  const warnings = [];
  const queryReports = [];

  for (const queryDefinition of dataset.queries) {
    const report = await evaluateQuery(supabase, dataset, queryDefinition, topKValues);
    queryReports.push(report);

    if (!report.retrieval.denseEnabled) {
      warnings.push(
        "Dense retrieval was skipped because EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL is not configured.",
      );
    }

    console.log(
      `${report.answer.pass ? "PASS" : "FAIL"} ${report.id} ` +
        `grounded=${formatNullableMetric(report.answer.groundednessScore)} ` +
        `citationHit=${formatNullableMetric(report.answer.citations.hit)} ` +
        `latency=${report.latencyMs}ms`,
    );
  }

  const summary = aggregateSummary(queryReports, topKValues);

  console.log(`\nLoaded dataset: ${absolutePath}`);
  console.log(`Queries: ${dataset.queries.length}`);
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of [...new Set(warnings)]) {
      console.log(`- ${warning}`);
    }
  }

  printSummary(summary, topKValues);

  const report = buildOutputReport(
    absolutePath,
    dataset,
    topKValues,
    queryReports,
    summary,
    [...new Set(warnings)],
  );

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nDetailed report written to: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
