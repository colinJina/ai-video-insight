#!/usr/bin/env node

import crypto from "node:crypto";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import * as z from "zod/v4";

const SERVER_NAME = "ai-video-insight";
const SERVER_VERSION = "0.1.0";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const CONVERSATION_SUMMARY_KEY = "conversation_summary";

let supabaseClient = null;

function readEnv(name) {
  return process.env[name]?.trim() ?? "";
}

function getSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the MCP server.",
    );
  }

  supabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return Math.min(value, MAX_LIMIT);
}

function defaultUserId() {
  return readEnv("MCP_DEFAULT_USER_ID") || null;
}

function filterByUser(builder, userId) {
  const scopedUserId = userId || defaultUserId();
  return scopedUserId ? builder.eq("user_id", scopedUserId) : builder;
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function textContent(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : jsonText(value),
      },
    ],
  };
}

function resourceText(uri, value, mimeType = "application/json") {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType,
        text: typeof value === "string" ? value : jsonText(value),
      },
    ],
  };
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function trimText(value, limit = 1200) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
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

function tokenize(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return [];
  }

  return [...buildAsciiTokens(normalized), ...buildCjkBigrams(normalized)];
}

function computeLexicalScore(query, text) {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return 0;
  }

  const textTokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

function normalizeOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function chunkMatchesWindow(chunk, startSeconds, endSeconds) {
  if (startSeconds === null && endSeconds === null) {
    return true;
  }

  const chunkStart = normalizeOptionalNumber(chunk.start_seconds);
  const chunkEnd = normalizeOptionalNumber(chunk.end_seconds);
  if (chunkStart === null && chunkEnd === null) {
    return false;
  }

  const effectiveStart = chunkStart ?? chunkEnd ?? 0;
  const effectiveEnd = Math.max(chunkEnd ?? effectiveStart, effectiveStart);
  const filterStart = startSeconds ?? 0;
  const filterEnd = endSeconds ?? Number.POSITIVE_INFINITY;

  return effectiveEnd >= filterStart && effectiveStart <= filterEnd;
}

function normalizeMemoryFingerprint(value) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function createMemoryKey(kind, content) {
  return crypto
    .createHash("sha256")
    .update(`${kind.toLowerCase()}::${normalizeMemoryFingerprint(content)}`)
    .digest("hex");
}

function mapAnalysisSummary(row) {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    title: row.result?.title ?? row.video?.title ?? "Untitled analysis",
    summary: row.result?.summary ?? null,
    transcriptSource: row.transcript_source ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChunk(row, score = null) {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    userId: row.user_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    startSeconds: normalizeOptionalNumber(row.start_seconds),
    endSeconds: normalizeOptionalNumber(row.end_seconds),
    score,
  };
}

async function fetchAnalysis(analysisId, userId = null) {
  let builder = getSupabase()
    .from("analysis_records")
    .select("*")
    .eq("id", analysisId);

  builder = filterByUser(builder, userId);

  const { data, error } = await builder.maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`Analysis not found: ${analysisId}`);
  }

  return data;
}

async function listAnalysisRows({ userId = null, query = "", includeArchived = false, limit = DEFAULT_LIMIT } = {}) {
  let builder = getSupabase()
    .from("analysis_records")
    .select("id,user_id,status,video,result,transcript_source,archived_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  builder = filterByUser(builder, userId);
  builder = includeArchived ? builder.not("archived_at", "is", null) : builder.is("archived_at", null);

  if (query.trim()) {
    const escaped = query.trim().replaceAll("%", "\\%").replaceAll(",", " ");
    builder = builder.or(
      [
        `video->>title.ilike.%${escaped}%`,
        `video->>originalUrl.ilike.%${escaped}%`,
        `video->>normalizedUrl.ilike.%${escaped}%`,
        `result->>title.ilike.%${escaped}%`,
        `result->>summary.ilike.%${escaped}%`,
      ].join(","),
    );
  }

  const { data, error } = await builder;
  if (error) {
    throw error;
  }

  return data ?? [];
}

async function listRecentResources(kind) {
  const rows = await listAnalysisRows({ limit: 10, includeArchived: false });
  return {
    resources: rows.map((row) => {
      const title = row.result?.title ?? row.video?.title ?? "Untitled analysis";
      return {
        uri: `analysis://${row.id}/${kind}`,
        name: `${title} ${kind}`,
        title: `${title} ${kind}`,
        description: `AI Video Insight ${kind} resource for analysis ${row.id}`,
        mimeType: "application/json",
      };
    }),
  };
}

async function fetchMemoryRows(analysisId, userId = null) {
  let builder = getSupabase()
    .from("memory_store")
    .select("*")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: true });

  builder = filterByUser(builder, userId);

  const { data, error } = await builder;
  if (error) {
    throw error;
  }

  return data ?? [];
}

function mapMemoryRows(rows) {
  return {
    conversationSummary:
      rows.find((row) => row.memory_key === CONVERSATION_SUMMARY_KEY)?.content ?? null,
    memoryItems: rows
      .filter((row) => row.memory_key !== CONVERSATION_SUMMARY_KEY)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        content: row.content,
        source: row.source,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
  };
}

async function searchTranscriptRows({
  analysisId,
  userId = null,
  query,
  limit = DEFAULT_LIMIT,
  startSeconds = null,
  endSeconds = null,
}) {
  const scopedUserId = userId || defaultUserId();
  const finalLimit = clampLimit(limit);

  if (scopedUserId) {
    try {
      const { data, error } = await getSupabase().rpc("search_analysis_transcript_chunks", {
        filter_analysis_id: analysisId,
        filter_user_id: scopedUserId,
        query_text: query,
        match_count: finalLimit,
        filter_start_seconds: startSeconds,
        filter_end_seconds: endSeconds,
      });

      if (error) {
        throw error;
      }
      if (data?.length) {
        return data.map((row) => mapChunk(row, normalizeOptionalNumber(row.score) ?? 0));
      }
    } catch (error) {
      console.error("[mcp] Supabase transcript search RPC failed; falling back to local lexical scoring.", error);
    }
  }

  let builder = getSupabase()
    .from("analysis_transcript_chunks")
    .select("id,analysis_id,user_id,chunk_index,text,start_seconds,end_seconds")
    .eq("analysis_id", analysisId)
    .order("chunk_index", { ascending: true });

  builder = filterByUser(builder, userId);

  const { data, error } = await builder;
  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((row) => chunkMatchesWindow(row, startSeconds, endSeconds))
    .map((row) => mapChunk(row, computeLexicalScore(query, row.text)))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, finalLimit);
}

function buildAnalysisContext(row, { includeTranscript = false, includeChat = true } = {}) {
  const result = row.result ?? {};
  const transcript = row.transcript ?? null;
  return {
    analysis: mapAnalysisSummary(row),
    video: {
      title: row.video?.title ?? null,
      originalUrl: row.video?.originalUrl ?? null,
      normalizedUrl: row.video?.normalizedUrl ?? null,
      host: row.video?.host ?? null,
      durationSeconds: row.video?.durationSeconds ?? null,
    },
    summary: result.summary ?? null,
    keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
    outline: Array.isArray(result.outline) ? result.outline : [],
    suggestedQuestions: Array.isArray(result.suggestedQuestions)
      ? result.suggestedQuestions
      : [],
    chatHistory: includeChat
      ? (row.chat_messages ?? []).slice(-12).map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt ?? null,
        }))
      : [],
    transcript: includeTranscript && transcript
      ? {
          source: row.transcript_source ?? transcript.source ?? null,
          language: transcript.language ?? null,
          segmentCount: Array.isArray(transcript.segments) ? transcript.segments.length : 0,
          excerpt: trimText(transcript.fullText ?? "", 2400),
        }
      : null,
  };
}

function registerResources(server) {
  const registerAnalysisResource = (name, kind, description, builder) => {
    server.registerResource(
      name,
      new ResourceTemplate(`analysis://{analysisId}/${kind}`, {
        list: () => listRecentResources(kind),
      }),
      {
        title: `Analysis ${kind}`,
        description,
        mimeType: "application/json",
      },
      async (uri, variables) => {
        const analysisId = String(variables.analysisId ?? "");
        if (!analysisId) {
          throw new Error("Missing analysisId in resource URI.");
        }

        return resourceText(uri, await builder(analysisId));
      },
    );
  };

  registerAnalysisResource(
    "analysis-summary",
    "summary",
    "Summary, key points, outline, and basic video metadata for one analysis.",
    async (analysisId) => {
      const row = await fetchAnalysis(analysisId);
      return buildAnalysisContext(row, { includeTranscript: false, includeChat: false });
    },
  );

  registerAnalysisResource(
    "analysis-outline",
    "outline",
    "Timestamped outline for one analysis.",
    async (analysisId) => {
      const row = await fetchAnalysis(analysisId);
      return {
        analysis: mapAnalysisSummary(row),
        outline: Array.isArray(row.result?.outline) ? row.result.outline : [],
      };
    },
  );

  registerAnalysisResource(
    "analysis-transcript",
    "transcript",
    "Transcript excerpt and transcript metadata for one analysis.",
    async (analysisId) => {
      const row = await fetchAnalysis(analysisId);
      return buildAnalysisContext(row, { includeTranscript: true, includeChat: false }).transcript;
    },
  );

  registerAnalysisResource(
    "analysis-memory",
    "memory",
    "Persisted conversation summary and memory items for one analysis.",
    async (analysisId) => mapMemoryRows(await fetchMemoryRows(analysisId)),
  );

  registerAnalysisResource(
    "analysis-chat-history",
    "chat-history",
    "Recent chat messages for one analysis.",
    async (analysisId) => {
      const row = await fetchAnalysis(analysisId);
      return {
        analysis: mapAnalysisSummary(row),
        chatHistory: (row.chat_messages ?? []).map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt ?? null,
        })),
      };
    },
  );
}

function registerTools(server) {
  server.registerTool(
    "list_analyses",
    {
      title: "List Analyses",
      description: "List recent video analysis workspaces available to the MCP server.",
      inputSchema: {
        userId: z.string().uuid().optional().describe("Optional Supabase user id. Defaults to MCP_DEFAULT_USER_ID when set."),
        query: z.string().optional().describe("Optional text filter over title, URL, and summary."),
        includeArchived: z.boolean().default(false),
        limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
      },
    },
    async ({ userId, query = "", includeArchived = false, limit = DEFAULT_LIMIT }) => {
      const rows = await listAnalysisRows({ userId, query, includeArchived, limit });
      return textContent({
        analyses: rows.map(mapAnalysisSummary),
      });
    },
  );

  server.registerTool(
    "get_analysis_context",
    {
      title: "Get Analysis Context",
      description: "Fetch the reusable context for one video analysis, including summary, outline, and recent chat history.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().optional().describe("Optional Supabase user id. Defaults to MCP_DEFAULT_USER_ID when set."),
        includeTranscript: z.boolean().default(false),
        includeChat: z.boolean().default(true),
      },
    },
    async ({ analysisId, userId, includeTranscript = false, includeChat = true }) => {
      const row = await fetchAnalysis(analysisId, userId);
      return textContent(buildAnalysisContext(row, { includeTranscript, includeChat }));
    },
  );

  server.registerTool(
    "search_transcript",
    {
      title: "Search Transcript",
      description: "Search transcript chunks for evidence snippets inside one analysis.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().optional().describe("Optional Supabase user id. Defaults to MCP_DEFAULT_USER_ID when set."),
        query: z.string().min(1),
        limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
        startSeconds: z.number().nonnegative().optional(),
        endSeconds: z.number().nonnegative().optional(),
      },
    },
    async ({ analysisId, userId, query, limit = DEFAULT_LIMIT, startSeconds, endSeconds }) => {
      const matches = await searchTranscriptRows({
        analysisId,
        userId,
        query,
        limit,
        startSeconds: startSeconds ?? null,
        endSeconds: endSeconds ?? null,
      });
      return textContent({
        analysisId,
        query,
        matches,
      });
    },
  );

  server.registerTool(
    "get_memory",
    {
      title: "Get Memory",
      description: "Read persisted memory and rolling conversation summary for one analysis.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().optional().describe("Optional Supabase user id. Defaults to MCP_DEFAULT_USER_ID when set."),
      },
    },
    async ({ analysisId, userId }) => {
      return textContent(mapMemoryRows(await fetchMemoryRows(analysisId, userId)));
    },
  );

  server.registerTool(
    "save_memory_note",
    {
      title: "Save Memory Note",
      description: "Save a bounded manual memory note for one analysis. This is the only write tool in the MVP server.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().describe("Supabase user id that owns the analysis."),
        content: z.string().min(1).max(500),
        source: z.string().max(120).default("mcp.manual_note"),
        importance: z.number().min(0).max(1).default(0.5),
      },
    },
    async ({ analysisId, userId, content, source = "mcp.manual_note", importance = 0.5 }) => {
      await fetchAnalysis(analysisId, userId);
      const normalizedContent = normalizeWhitespace(content);
      const memoryKey = createMemoryKey("manual_note", normalizedContent);
      const { error } = await getSupabase()
        .from("memory_store")
        .upsert(
          {
            analysis_id: analysisId,
            user_id: userId,
            memory_key: memoryKey,
            kind: "manual_note",
            content: normalizedContent,
            source,
            metadata: {
              importance,
              createdBy: "mcp-server",
            },
          },
          {
            onConflict: "analysis_id,memory_key",
          },
        );

      if (error) {
        throw error;
      }

      return textContent({
        saved: true,
        analysisId,
        kind: "manual_note",
        memoryKey,
        content: normalizedContent,
      });
    },
  );

  server.registerTool(
    "export_report_payload",
    {
      title: "Export Report Payload",
      description: "Build a PDF/report-ready JSON payload from one analysis without generating a binary PDF.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().optional().describe("Optional Supabase user id. Defaults to MCP_DEFAULT_USER_ID when set."),
        includeChatHistory: z.boolean().default(true),
      },
    },
    async ({ analysisId, userId, includeChatHistory = true }) => {
      const row = await fetchAnalysis(analysisId, userId);
      return textContent({
        title: row.result?.title ?? row.video?.title ?? "Untitled analysis",
        summary: row.result?.summary ?? "",
        keyPoints: Array.isArray(row.result?.keyPoints) ? row.result.keyPoints : [],
        outline: Array.isArray(row.result?.outline) ? row.result.outline : [],
        chatHistory: includeChatHistory ? row.chat_messages ?? [] : [],
      });
    },
  );
}

function registerPrompts(server) {
  server.registerPrompt(
    "answer_video_question",
    {
      title: "Answer Video Question",
      description: "Ground an answer in analysis context and transcript evidence.",
      argsSchema: {
        question: z.string().min(1),
        context: z.string().min(1),
      },
    },
    async ({ question, context }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "You are the grounding-first answer agent for a video analysis workspace.\n" +
              "Answer only from the supplied analysis context, transcript evidence, outline, and memory.\n" +
              "Do not invent timestamps, quotes, facts, or intentions. If evidence is insufficient, say what is missing.\n\n" +
              `Question:\n${question}\n\nContext:\n${context}\n\n` +
              "Return a concise answer with chunk references when transcript chunks are provided.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "verify_grounding",
    {
      title: "Verify Grounding",
      description: "Check whether an answer is supported by transcript evidence and memory.",
      argsSchema: {
        question: z.string().min(1),
        answer: z.string().min(1),
        evidence: z.string().min(1),
      },
    },
    async ({ question, answer, evidence }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "You are the grounding verifier. Check unsupported claims, citation mismatch, over-generalization, and wrong refusals.\n" +
              'Return JSON with {"verdict":"pass|revise|refuse","issues":[],"revised_answer":"","confidence":0.0}.\n\n' +
              `Question:\n${question}\n\nAnswer:\n${answer}\n\nEvidence:\n${evidence}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "prepare_interview_brief",
    {
      title: "Prepare Interview Brief",
      description: "Turn one analysis workspace into a concise interview preparation brief.",
      argsSchema: {
        context: z.string().min(1),
        role: z.string().default("Agent Engineer"),
      },
    },
    async ({ context, role = "Agent Engineer" }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Prepare a concise ${role} interview brief from this video analysis context.\n` +
              "Focus on key ideas, implementation takeaways, risks, and 5 likely interview questions.\n\n" +
              context,
          },
        },
      ],
    }),
  );
}

async function main() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerResources(server);
  registerTools(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[mcp] ${SERVER_NAME} ${SERVER_VERSION} is running over stdio.`);
}

main().catch((error) => {
  console.error("[mcp] Server failed:", error);
  process.exit(1);
});
