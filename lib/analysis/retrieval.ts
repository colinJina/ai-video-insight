import { normalizeWhitespace } from "@/lib/analysis/utils";
import type {
  RetrievalMetadataFilter,
  TranscriptChunk,
} from "@/lib/analysis/types";

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export type SparseSearchDocument<T> = {
  item: T;
  text: string;
};

function buildAsciiTokens(value: string) {
  return value.match(/[a-z0-9]+/gu)?.filter((token) => token.length >= 2) ?? [];
}

function buildCjkBigrams(value: string) {
  const characters = value.match(/[\u4e00-\u9fff]/gu) ?? [];
  if (characters.length <= 1) {
    return characters;
  }

  // Bigram tokenization keeps Chinese sparse retrieval usable without extra NLP deps.
  const bigrams: string[] = [];
  for (let index = 0; index < characters.length - 1; index += 1) {
    bigrams.push(`${characters[index]}${characters[index + 1]}`);
  }

  return bigrams;
}

export function tokenizeRetrievalText(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return [];
  }

  return [...buildAsciiTokens(normalized), ...buildCjkBigrams(normalized)];
}

export function buildTokenFrequency(tokens: string[]) {
  const frequency = new Map<string, number>();

  tokens.forEach((token) => {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  });

  return frequency;
}

export function computeLexicalScore(query: string, text: string) {
  const queryTokens = new Set(tokenizeRetrievalText(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const textTokens = new Set(tokenizeRetrievalText(text));
  let overlap = 0;

  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / queryTokens.size;
}

export function computeSparseScores<T>(
  query: string,
  documents: SparseSearchDocument<T>[],
) {
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
    preparedDocuments.reduce(
      (total, document) => total + document.documentLength,
      0,
    ) / preparedDocuments.length;

  return preparedDocuments
    .map((document) => {
      let score = 0;

      queryTokens.forEach((token) => {
        const termFrequency = document.tokenFrequency.get(token) ?? 0;
        if (termFrequency <= 0) {
          return;
        }

        const documentFrequency = preparedDocuments.reduce(
          (count, current) => count + (current.uniqueTokens.has(token) ? 1 : 0),
          0,
        );
        const inverseDocumentFrequency = Math.log(
          1 +
            (preparedDocuments.length - documentFrequency + 0.5) /
              (documentFrequency + 0.5),
        );
        const numerator = termFrequency * (BM25_K1 + 1);
        const denominator =
          termFrequency +
          BM25_K1 *
            (1 -
              BM25_B +
              BM25_B * (document.documentLength / averageDocumentLength));

        score += inverseDocumentFrequency * (numerator / denominator);
      });

      return {
        item: document.item,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function normalizeScores<T extends { score: number }>(entries: T[]) {
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

function parseClockTimestampToSeconds(value: string) {
  const parts = value
    .split(":")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseDurationPhraseToSeconds(value: string) {
  const match = value.match(
    /(\d+(?:\.\d+)?)\s*(小时|分钟|分|秒|hours?|hrs?|minutes?|mins?|seconds?|secs?)/i,
  );
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();
  if (unit.includes("hour") || unit.includes("hr") || unit === "小时") {
    return Math.round(amount * 3600);
  }
  if (unit.includes("min") || unit === "分钟" || unit === "分") {
    return Math.round(amount * 60);
  }

  return Math.round(amount);
}

function buildMetadataFilter(
  startSeconds: number | null,
  endSeconds: number | null,
  label: string,
): RetrievalMetadataFilter | null {
  const safeStart =
    typeof startSeconds === "number" && Number.isFinite(startSeconds)
      ? Math.max(0, startSeconds)
      : null;
  const safeEnd =
    typeof endSeconds === "number" && Number.isFinite(endSeconds)
      ? Math.max(0, endSeconds)
      : null;

  if (safeStart === null && safeEnd === null) {
    return null;
  }

  if (safeStart !== null && safeEnd !== null && safeStart > safeEnd) {
    return {
      startSeconds: safeEnd,
      endSeconds: safeStart,
      label,
    };
  }

  return {
    startSeconds: safeStart,
    endSeconds: safeEnd,
    label,
  };
}

export function extractMetadataFilterFromQuery(
  query: string,
  durationSeconds: number | null,
): RetrievalMetadataFilter | null {
  const normalized = normalizeWhitespace(query);
  if (!normalized) {
    return null;
  }

  const explicitRange = normalized.match(
    /(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:到|至|\-|~|—|–|to)\s*(\d{1,2}:\d{2}(?::\d{2})?)/i,
  );
  if (explicitRange) {
    const start = parseClockTimestampToSeconds(explicitRange[1]);
    const end = parseClockTimestampToSeconds(explicitRange[2]);
    return buildMetadataFilter(
      start,
      end,
      `time_range:${explicitRange[1]}-${explicitRange[2]}`,
    );
  }

  const aroundTime = normalized.match(
    /(?:在|到|around|near|at)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:附近|左右|前后|around|near)?/i,
  );
  if (aroundTime) {
    const center = parseClockTimestampToSeconds(aroundTime[1]);
    if (center !== null) {
      return buildMetadataFilter(
        Math.max(0, center - 90),
        center + 90,
        `time_anchor:${aroundTime[1]}`,
      );
    }
  }

  const leadingDuration = normalized.match(
    /(?:前|开始|开头)\s*(\d+(?:\.\d+)?)\s*(小时|分钟|分|秒)/,
  );
  if (leadingDuration) {
    const seconds = parseDurationPhraseToSeconds(leadingDuration[0]);
    return buildMetadataFilter(
      0,
      seconds,
      `leading_window:${leadingDuration[0]}`,
    );
  }

  const endingDuration = normalized.match(
    /(?:后|最后)\s*(\d+(?:\.\d+)?)\s*(小时|分钟|分|秒)/,
  );
  if (endingDuration) {
    const seconds = parseDurationPhraseToSeconds(endingDuration[0]);
    if (
      seconds !== null &&
      durationSeconds !== null &&
      Number.isFinite(durationSeconds)
    ) {
      return buildMetadataFilter(
        Math.max(0, durationSeconds - seconds),
        durationSeconds,
        `trailing_window:${endingDuration[0]}`,
      );
    }
  }

  if (/(开头|一开始|开始部分)/.test(normalized)) {
    return buildMetadataFilter(0, 180, "leading_section");
  }

  if (/(结尾|最后部分|最后一段)/.test(normalized) && durationSeconds !== null) {
    return buildMetadataFilter(
      Math.max(0, durationSeconds - 180),
      durationSeconds,
      "trailing_section",
    );
  }

  return null;
}

export function chunkMatchesMetadataFilter(
  chunk: Pick<TranscriptChunk, "startSeconds" | "endSeconds">,
  filter: RetrievalMetadataFilter | null,
) {
  if (!filter) {
    return true;
  }

  const chunkStart = chunk.startSeconds ?? chunk.endSeconds;
  const chunkEnd = chunk.endSeconds ?? chunk.startSeconds;
  if (chunkStart === null && chunkEnd === null) {
    return false;
  }

  const effectiveStart = chunkStart ?? chunkEnd ?? 0;
  const effectiveEnd = Math.max(chunkEnd ?? effectiveStart, effectiveStart);
  const filterStart = filter.startSeconds ?? 0;
  const filterEnd = filter.endSeconds ?? Number.POSITIVE_INFINITY;

  return effectiveEnd >= filterStart && effectiveStart <= filterEnd;
}
