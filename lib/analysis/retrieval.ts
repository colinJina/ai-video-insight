import { normalizeWhitespace } from "@/lib/analysis/utils";

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

  return [
    ...buildAsciiTokens(normalized),
    ...buildCjkBigrams(normalized),
  ];
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
          1 + (preparedDocuments.length - documentFrequency + 0.5) /
            (documentFrequency + 0.5),
        );
        const numerator = termFrequency * (BM25_K1 + 1);
        const denominator =
          termFrequency +
          BM25_K1 *
            (1 - BM25_B + BM25_B * (document.documentLength / averageDocumentLength));

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
