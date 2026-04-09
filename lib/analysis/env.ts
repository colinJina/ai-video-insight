const DEFAULT_EMBEDDING_TIMEOUT_MS = 20000;

function normalizeTimeout(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EMBEDDING_TIMEOUT_MS;
  }

  return Math.floor(parsed);
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
