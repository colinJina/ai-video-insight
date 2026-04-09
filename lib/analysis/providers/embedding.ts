import {
  getEmbeddingApiKey,
  getEmbeddingBaseUrl,
  getEmbeddingModel,
  getEmbeddingTimeoutMs,
  isEmbeddingConfigured,
} from "@/lib/analysis/env";
import { ExternalServiceError } from "@/lib/analysis/errors";
import type { EmbeddingProvider } from "@/lib/analysis/types";
import { fetchWithTimeout, isRecord } from "@/lib/analysis/utils";

const EMBEDDING_DIMENSIONS = 1536;

function resolveEmbeddingsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const trimmedPath = url.pathname.replace(/\/$/, "");

  if (
    trimmedPath === "" ||
    trimmedPath === "/" ||
    trimmedPath.endsWith("/v1")
  ) {
    url.pathname = `${trimmedPath}/embeddings`.replace("//", "/");
  }

  return url.toString();
}

function extractEmbedding(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  const firstItem = payload.data[0];
  if (!isRecord(firstItem) || !Array.isArray(firstItem.embedding)) {
    return null;
  }

  const embedding = firstItem.embedding
    .map((value) => (typeof value === "number" ? value : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    return null;
  }

  return embedding;
}

class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly kind = "disabled" as const;

  isConfigured() {
    return false;
  }

  async embedText(_: string): Promise<number[]> {
    throw new ExternalServiceError(
      "The embedding service is not configured.",
      true,
    );
  }
}

class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly kind = "http" as const;

  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    baseUrl: string,
    private readonly timeoutMs: number,
  ) {
    this.endpoint = resolveEmbeddingsUrl(baseUrl);
  }

  isConfigured() {
    return Boolean(this.endpoint && this.apiKey && this.model);
  }

  async embedText(input: string) {
    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input,
        }),
      },
      this.timeoutMs,
    );

    const rawBody = await response.text();
    let body: unknown = null;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new ExternalServiceError(
        "The embedding service returned a response that could not be parsed.",
      );
    }

    if (!response.ok) {
      const message =
        isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.message === "string"
          ? body.error.message
          : `The embedding service returned status ${response.status}.`;

      throw new ExternalServiceError(message);
    }

    const embedding = extractEmbedding(body);
    if (!embedding) {
      throw new ExternalServiceError(
        `The embedding service did not return a valid ${EMBEDDING_DIMENSIONS}-dimension vector.`,
      );
    }

    return embedding;
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  if (isEmbeddingConfigured()) {
    return new HttpEmbeddingProvider(
      getEmbeddingApiKey(),
      getEmbeddingModel(),
      getEmbeddingBaseUrl(),
      getEmbeddingTimeoutMs(),
    );
  }

  return new DisabledEmbeddingProvider();
}
