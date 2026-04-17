import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_DENSE_LIMIT = 12;
const DEFAULT_SPARSE_LIMIT = 10;
const DEFAULT_TOP_K = [1, 3, 5];
const DEFAULT_RETRIEVAL_DENSE_WEIGHT = 0.45;
const DEFAULT_RETRIEVAL_SPARSE_WEIGHT = 0.35;
const DEFAULT_RETRIEVAL_LEXICAL_WEIGHT = 0.2;

function printUsage() {
  console.log(`Usage:
  npm run eval:retrieval -- --dataset scripts/retrieval-eval.template.json
  npm run eval:retrieval -- --dataset scripts/my-eval.json --output .tmp/retrieval-report.json

Dataset shape:
  {
    "analysisId": "...",
    "userId": "...",
    "topK": [1, 3, 5],
    "queries": [
      {
        "id": "q1",
        "query": "...",
        "expectedChunkIndexes": [2, 3],
        "metadataFilter": {
          "startSeconds": 0,
          "endSeconds": 180,
          "label": "opening"
        }
      }
    ]
  }`);
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

function resolveEmbeddingsUrl(baseUrl) {
  const url = new URL(baseUrl);
  const trimmedPath = url.pathname.replace(/\/$/u, "");

  if (
    trimmedPath === "" ||
    trimmedPath === "/" ||
    trimmedPath.endsWith("/v1")
  ) {
    url.pathname = `${trimmedPath}/embeddings`.replace("//", "/");
  }

  return url.toString();
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
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
  const normalized = normalizeWhitespace(value).toLowerCase();
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

function normalizeFusionWeights() {
  const dense = Number(process.env.RETRIEVAL_DENSE_WEIGHT ?? DEFAULT_RETRIEVAL_DENSE_WEIGHT);
  const sparse = Number(process.env.RETRIEVAL_SPARSE_WEIGHT ?? DEFAULT_RETRIEVAL_SPARSE_WEIGHT);
  const lexical = Number(
    process.env.RETRIEVAL_LEXICAL_WEIGHT ?? DEFAULT_RETRIEVAL_LEXICAL_WEIGHT,
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

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object") {
    throw new Error("The dataset file must contain a JSON object.");
  }

  if (typeof dataset.analysisId !== "string" || !dataset.analysisId.trim()) {
    throw new Error("The dataset must include a non-empty analysisId.");
  }

  if (typeof dataset.userId !== "string" || !dataset.userId.trim()) {
    throw new Error("The dataset must include a non-empty userId.");
  }

  if (!Array.isArray(dataset.queries) || dataset.queries.length === 0) {
    throw new Error("The dataset must include at least one query.");
  }

  dataset.queries.forEach((query, index) => {
    if (typeof query.query !== "string" || !query.query.trim()) {
      throw new Error(`Query #${index + 1} is missing a non-empty query string.`);
    }

    if (
      !Array.isArray(query.expectedChunkIndexes) ||
      query.expectedChunkIndexes.length === 0 ||
      !query.expectedChunkIndexes.every((value) => Number.isInteger(value))
    ) {
      throw new Error(
        `Query #${index + 1} must include expectedChunkIndexes as a non-empty integer array.`,
      );
    }
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

async function fetchQueryEmbedding(query) {
  const baseUrl = process.env.EMBEDDING_BASE_URL?.trim();
  const apiKey = process.env.EMBEDDING_API_KEY?.trim();
  const model = process.env.EMBEDDING_MODEL?.trim();

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

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

async function runDenseRetrieval(supabase, dataset, queryDefinition, limit) {
  const queryEmbedding = await fetchQueryEmbedding(queryDefinition.query);
  if (!queryEmbedding) {
    return {
      enabled: false,
      matches: [],
    };
  }

  const { data, error } = await supabase.rpc("match_analysis_transcript_chunks", {
    filter_analysis_id: dataset.analysisId,
    filter_user_id: dataset.userId,
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
  const { data, error } = await supabase.rpc("search_analysis_transcript_chunks", {
    filter_analysis_id: dataset.analysisId,
    filter_user_id: dataset.userId,
    query_text: queryDefinition.query,
    match_count: limit,
    ...buildRpcMetadataFilter(queryDefinition),
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    text: row.text,
    startSeconds: coerceNumber(row.start_seconds),
    endSeconds: coerceNumber(row.end_seconds),
    score: coerceNumber(row.score) ?? 0,
  }));
}

function fuseRetrievedMatches(query, denseMatches, sparseMatches) {
  const weights = normalizeFusionWeights();
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
    metrics[`recall@${k}`] = relevant.size === 0 ? 0 : hitCount / relevant.size;
    metrics[`hit@${k}`] = hitCount > 0 ? 1 : 0;
  }

  return {
    metrics,
    mrr: firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1),
  };
}

function aggregateMetrics(methodReports, topKValues) {
  if (methodReports.length === 0) {
    const emptyMetrics = {};
    for (const k of topKValues) {
      emptyMetrics[`recall@${k}`] = 0;
      emptyMetrics[`hit@${k}`] = 0;
    }
    return {
      queryCount: 0,
      mrr: 0,
      metrics: emptyMetrics,
    };
  }

  const aggregate = {
    queryCount: methodReports.length,
    mrr: 0,
    metrics: {},
  };

  for (const k of topKValues) {
    aggregate.metrics[`recall@${k}`] = 0;
    aggregate.metrics[`hit@${k}`] = 0;
  }

  for (const report of methodReports) {
    aggregate.mrr += report.mrr;
    for (const k of topKValues) {
      aggregate.metrics[`recall@${k}`] += report.metrics[`recall@${k}`];
      aggregate.metrics[`hit@${k}`] += report.metrics[`hit@${k}`];
    }
  }

  aggregate.mrr /= methodReports.length;
  for (const k of topKValues) {
    aggregate.metrics[`recall@${k}`] /= methodReports.length;
    aggregate.metrics[`hit@${k}`] /= methodReports.length;
  }

  return aggregate;
}

function formatMetric(value) {
  return value.toFixed(3);
}

function printSummary(summary, topKValues) {
  console.log("\nSummary:");

  for (const [method, result] of Object.entries(summary)) {
    const parts = [`${method.padEnd(7)} MRR=${formatMetric(result.mrr)}`];
    for (const k of topKValues) {
      parts.push(`Recall@${k}=${formatMetric(result.metrics[`recall@${k}`])}`);
      parts.push(`Hit@${k}=${formatMetric(result.metrics[`hit@${k}`])}`);
    }
    console.log(parts.join("  "));
  }
}

function buildOutputReport(datasetPath, dataset, topKValues, queryReports, summary, warnings) {
  return {
    datasetPath,
    generatedAt: new Date().toISOString(),
    analysisId: dataset.analysisId,
    userId: dataset.userId,
    topK: topKValues,
    warnings,
    summary,
    queries: queryReports,
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
  const denseLimit = Number.isInteger(dataset.denseLimit) ? dataset.denseLimit : DEFAULT_DENSE_LIMIT;
  const sparseLimit = Number.isInteger(dataset.sparseLimit)
    ? dataset.sparseLimit
    : DEFAULT_SPARSE_LIMIT;
  const supabase = createSupabaseAdminClient();
  const warnings = [];
  const perMethodReports = {
    dense: [],
    sparse: [],
    hybrid: [],
  };
  const queryReports = [];

  for (const queryDefinition of dataset.queries) {
    const denseResult = await runDenseRetrieval(
      supabase,
      dataset,
      queryDefinition,
      Math.max(denseLimit, ...topKValues),
    );
    const sparseMatches = await runSparseRetrieval(
      supabase,
      dataset,
      queryDefinition,
      Math.max(sparseLimit, ...topKValues),
    );

    if (!denseResult.enabled) {
      warnings.push(
        "Dense retrieval was skipped because EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL is not configured.",
      );
    }

    const denseRanking = denseResult.matches;
    const sparseRanking = sparseMatches;
    const hybridRanking = denseResult.enabled
      ? fuseRetrievedMatches(queryDefinition.query, denseRanking, sparseRanking)
      : [...sparseRanking];

    const denseEvaluation = denseResult.enabled
      ? evaluateRanking(denseRanking, queryDefinition.expectedChunkIndexes, topKValues)
      : null;
    const sparseEvaluation = evaluateRanking(
      sparseRanking,
      queryDefinition.expectedChunkIndexes,
      topKValues,
    );
    const hybridEvaluation = evaluateRanking(
      hybridRanking,
      queryDefinition.expectedChunkIndexes,
      topKValues,
    );

    if (denseEvaluation) {
      perMethodReports.dense.push(denseEvaluation);
    }
    perMethodReports.sparse.push(sparseEvaluation);
    perMethodReports.hybrid.push(hybridEvaluation);

    queryReports.push({
      id: queryDefinition.id ?? queryDefinition.query,
      query: queryDefinition.query,
      expectedChunkIndexes: queryDefinition.expectedChunkIndexes,
      metadataFilter: queryDefinition.metadataFilter ?? null,
      methods: {
        dense: denseEvaluation
          ? {
              topChunkIndexes: denseRanking.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
              mrr: denseEvaluation.mrr,
              metrics: denseEvaluation.metrics,
            }
          : null,
        sparse: {
          topChunkIndexes: sparseRanking.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
          mrr: sparseEvaluation.mrr,
          metrics: sparseEvaluation.metrics,
        },
        hybrid: {
          topChunkIndexes: hybridRanking.slice(0, Math.max(...topKValues)).map((entry) => entry.chunkIndex),
          mrr: hybridEvaluation.mrr,
          metrics: hybridEvaluation.metrics,
        },
      },
    });
  }

  const summary = {
    dense: aggregateMetrics(perMethodReports.dense, topKValues),
    sparse: aggregateMetrics(perMethodReports.sparse, topKValues),
    hybrid: aggregateMetrics(perMethodReports.hybrid, topKValues),
  };

  console.log(`Loaded dataset: ${absolutePath}`);
  console.log(`Queries: ${dataset.queries.length}`);
  console.log(`Dense limit: ${denseLimit}`);
  console.log(`Sparse limit: ${sparseLimit}`);
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
