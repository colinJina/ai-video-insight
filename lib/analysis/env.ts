const DEFAULT_EMBEDDING_TIMEOUT_MS = 20000;
const DEFAULT_RETRIEVAL_CANDIDATE_LIMIT = 12;
const DEFAULT_RETRIEVAL_SPARSE_CANDIDATE_LIMIT = 10;
const DEFAULT_RETRIEVAL_FINAL_LIMIT = 4;
const DEFAULT_RETRIEVAL_NEIGHBOR_WINDOW = 1;
const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.35;
const DEFAULT_RETRIEVAL_DENSE_WEIGHT = 0.45;
const DEFAULT_RETRIEVAL_SPARSE_WEIGHT = 0.35;
const DEFAULT_RETRIEVAL_LEXICAL_WEIGHT = 0.2;

function normalizeTimeout(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EMBEDDING_TIMEOUT_MS;
  }

  return Math.floor(parsed);
}

function normalizePositiveInteger(
  value: string | undefined,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeThreshold(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 0), 1);
}

export function getEmbeddingBaseUrl() {
  return process.env.EMBEDDING_BASE_URL?.trim() ?? "";
}

export function getEmbeddingApiKey() {
  return process.env.EMBEDDING_API_KEY?.trim() ?? "";
}

export function getEmbeddingModel() {
  return process.env.EMBEDDING_MODEL?.trim() ?? "";
}

export function getEmbeddingTimeoutMs() {
  return normalizeTimeout(process.env.EMBEDDING_TIMEOUT_MS);
}

export function isEmbeddingConfigured() {
  return Boolean(
    getEmbeddingBaseUrl() &&
      getEmbeddingApiKey() &&
      getEmbeddingModel(),
  );
}

export function getRetrievalCandidateLimit() {
  return normalizePositiveInteger(
    process.env.RETRIEVAL_CANDIDATE_LIMIT,
    DEFAULT_RETRIEVAL_CANDIDATE_LIMIT,
  );
}

export function getRetrievalFinalLimit() {
  return normalizePositiveInteger(
    process.env.RETRIEVAL_FINAL_LIMIT,
    DEFAULT_RETRIEVAL_FINAL_LIMIT,
  );
}

export function getRetrievalSparseCandidateLimit() {
  return normalizePositiveInteger(
    process.env.RETRIEVAL_SPARSE_CANDIDATE_LIMIT,
    DEFAULT_RETRIEVAL_SPARSE_CANDIDATE_LIMIT,
  );
}

export function getRetrievalNeighborWindow() {
  return normalizePositiveInteger(
    process.env.RETRIEVAL_NEIGHBOR_WINDOW,
    DEFAULT_RETRIEVAL_NEIGHBOR_WINDOW,
  );
}

export function getRetrievalScoreThreshold() {
  return normalizeThreshold(
    process.env.RETRIEVAL_SCORE_THRESHOLD,
    DEFAULT_RETRIEVAL_SCORE_THRESHOLD,
  );
}

export function getRetrievalDenseWeight() {
  return normalizeThreshold(
    process.env.RETRIEVAL_DENSE_WEIGHT,
    DEFAULT_RETRIEVAL_DENSE_WEIGHT,
  );
}

export function getRetrievalSparseWeight() {
  return normalizeThreshold(
    process.env.RETRIEVAL_SPARSE_WEIGHT,
    DEFAULT_RETRIEVAL_SPARSE_WEIGHT,
  );
}

export function getRetrievalLexicalWeight() {
  return normalizeThreshold(
    process.env.RETRIEVAL_LEXICAL_WEIGHT,
    DEFAULT_RETRIEVAL_LEXICAL_WEIGHT,
  );
}

export function isRetrievalQueryRewriteEnabled() {
  return (process.env.RETRIEVAL_QUERY_REWRITE_ENABLED ?? "true")
    .trim()
    .toLowerCase() !== "false";
}
