#!/usr/bin/env node

import crypto from "node:crypto";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import * as z from "zod/v4";

const SERVER_NAME = "ai-video-insight";
const SERVER_VERSION = "0.1.0";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const CONVERSATION_SUMMARY_KEY = "conversation_summary";
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3333;

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

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }

  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function verifySupabaseAccessToken(token) {
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("Invalid Supabase access token.");
  }

  const claims = decodeJwtPayload(token);
  return {
    token,
    clientId: data.user.id,
    scopes: ["mcp:read", "mcp:write"],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: {
      userId: data.user.id,
      email: data.user.email ?? null,
      role: claims.role ?? null,
    },
  };
}

function userIdFromAuthInfo(authInfo) {
  const userId = authInfo?.extra?.userId;
  return typeof userId === "string" && userId ? userId : null;
}

function scopedUserId(extra, requestedUserId = null) {
  const authenticatedUserId = userIdFromAuthInfo(extra?.authInfo);
  if (authenticatedUserId) {
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      throw new Error("Authenticated MCP user cannot access another user's data.");
    }

    return authenticatedUserId;
  }

  return requestedUserId || defaultUserId();
}

function requireScopedUserId(extra, requestedUserId = null) {
  const userId = scopedUserId(extra, requestedUserId);
  if (!userId) {
    throw new Error(
      "Missing MCP user scope. Use Bearer auth for Streamable HTTP or set MCP_DEFAULT_USER_ID for local stdio.",
    );
  }

  return userId;
}

function filterByUser(builder, userId) {
  return builder.eq("user_id", userId);
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
  if (!userId) {
    throw new Error("fetchAnalysis requires a scoped user id.");
  }

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
  if (!userId) {
    throw new Error("listAnalysisRows requires a scoped user id.");
  }

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

async function listRecentResources(kind, extra) {
  const rows = await listAnalysisRows({
    userId: requireScopedUserId(extra),
    limit: 10,
    includeArchived: false,
  });
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
  if (!userId) {
    throw new Error("fetchMemoryRows requires a scoped user id.");
  }

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
  if (!userId) {
    throw new Error("searchTranscriptRows requires a scoped user id.");
  }

  const scopedUserId = userId;
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
        list: (extra) => listRecentResources(kind, extra),
      }),
      {
        title: `Analysis ${kind}`,
        description,
        mimeType: "application/json",
      },
      async (uri, variables, extra) => {
        const analysisId = String(variables.analysisId ?? "");
        if (!analysisId) {
          throw new Error("Missing analysisId in resource URI.");
        }

        return resourceText(uri, await builder(analysisId, requireScopedUserId(extra)));
      },
    );
  };

  registerAnalysisResource(
    "analysis-summary",
    "summary",
    "Summary, key points, outline, and basic video metadata for one analysis.",
    async (analysisId, userId) => {
      const row = await fetchAnalysis(analysisId, userId);
      return buildAnalysisContext(row, { includeTranscript: false, includeChat: false });
    },
  );

  registerAnalysisResource(
    "analysis-outline",
    "outline",
    "Timestamped outline for one analysis.",
    async (analysisId, userId) => {
      const row = await fetchAnalysis(analysisId, userId);
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
    async (analysisId, userId) => {
      const row = await fetchAnalysis(analysisId, userId);
      return buildAnalysisContext(row, { includeTranscript: true, includeChat: false }).transcript;
    },
  );

  registerAnalysisResource(
    "analysis-memory",
    "memory",
    "Persisted conversation summary and memory items for one analysis.",
    async (analysisId, userId) => mapMemoryRows(await fetchMemoryRows(analysisId, userId)),
  );

  registerAnalysisResource(
    "analysis-chat-history",
    "chat-history",
    "Recent chat messages for one analysis.",
    async (analysisId, userId) => {
      const row = await fetchAnalysis(analysisId, userId);
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
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
        query: z.string().optional().describe("Optional text filter over title, URL, and summary."),
        includeArchived: z.boolean().default(false),
        limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
      },
    },
    async ({ userId, query = "", includeArchived = false, limit = DEFAULT_LIMIT }, extra) => {
      const rows = await listAnalysisRows({
        userId: requireScopedUserId(extra, userId),
        query,
        includeArchived,
        limit,
      });
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
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
        includeTranscript: z.boolean().default(false),
        includeChat: z.boolean().default(true),
      },
    },
    async ({ analysisId, userId, includeTranscript = false, includeChat = true }, extra) => {
      const row = await fetchAnalysis(analysisId, requireScopedUserId(extra, userId));
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
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
        query: z.string().min(1),
        limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
        startSeconds: z.number().nonnegative().optional(),
        endSeconds: z.number().nonnegative().optional(),
      },
    },
    async ({ analysisId, userId, query, limit = DEFAULT_LIMIT, startSeconds, endSeconds }, extra) => {
      const matches = await searchTranscriptRows({
        analysisId,
        userId: requireScopedUserId(extra, userId),
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
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
      },
    },
    async ({ analysisId, userId }, extra) => {
      return textContent(mapMemoryRows(await fetchMemoryRows(analysisId, requireScopedUserId(extra, userId))));
    },
  );

  server.registerTool(
    "save_memory_note",
    {
      title: "Save Memory Note",
      description: "Save a bounded manual memory note for one analysis. This is the only write tool in the MVP server.",
      inputSchema: {
        analysisId: z.string().uuid(),
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
        content: z.string().min(1).max(500),
        source: z.string().max(120).default("mcp.manual_note"),
        importance: z.number().min(0).max(1).default(0.5),
      },
    },
    async ({ analysisId, userId, content, source = "mcp.manual_note", importance = 0.5 }, extra) => {
      const scopedUser = requireScopedUserId(extra, userId);
      await fetchAnalysis(analysisId, scopedUser);
      const normalizedContent = normalizeWhitespace(content);
      const memoryKey = createMemoryKey("manual_note", normalizedContent);
      const { error } = await getSupabase()
        .from("memory_store")
        .upsert(
          {
            analysis_id: analysisId,
            user_id: scopedUser,
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
        userId: z.string().uuid().optional().describe("Local stdio fallback only. Streamable HTTP derives the user from Bearer auth."),
        includeChatHistory: z.boolean().default(true),
      },
    },
    async ({ analysisId, userId, includeChatHistory = true }, extra) => {
      const row = await fetchAnalysis(analysisId, requireScopedUserId(extra, userId));
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

function createAiVideoInsightMcpServer() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerResources(server);
  registerTools(server);
  registerPrompts(server);

  return server;
}

async function runStdioServer() {
  const server = createAiVideoInsightMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[mcp] ${SERVER_NAME} ${SERVER_VERSION} is running over stdio.`);
}

function readPort() {
  const value = Number(readEnv("MCP_HTTP_PORT") || readEnv("PORT") || DEFAULT_HTTP_PORT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_HTTP_PORT;
}

function readHost() {
  return readEnv("MCP_HTTP_HOST") || DEFAULT_HTTP_HOST;
}

function readAllowedHosts() {
  const value = readEnv("MCP_ALLOWED_HOSTS");
  return value ? value.split(",").map((host) => host.trim()).filter(Boolean) : undefined;
}

function isHttpAuthDisabled() {
  return ["1", "true", "yes"].includes(readEnv("MCP_HTTP_AUTH_DISABLED").toLowerCase());
}

function assertSameSessionUser(session, authInfo) {
  const authUserId = userIdFromAuthInfo(authInfo);
  if (!authUserId || session.userId !== authUserId) {
    throw new Error("MCP session does not belong to the authenticated user.");
  }
}

function headerString(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value ? value : null;
}

function buildAuthMiddleware(mcpUrl) {
  return requireBearerAuth({
    verifier: {
      verifyAccessToken: verifySupabaseAccessToken,
    },
    requiredScopes: [],
    resourceMetadataUrl: mcpUrl.toString(),
  });
}

async function runStreamableHttpServer() {
  const host = readHost();
  const port = readPort();
  const authDisabled = isHttpAuthDisabled();
  const mcpUrl = new URL(`http://${host}:${port}/mcp`);
  const app = createMcpExpressApp({
    host,
    allowedHosts: readAllowedHosts(),
  });
  const authMiddleware = authDisabled ? null : buildAuthMiddleware(mcpUrl);
  const sessions = new Map();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: "streamable-http",
      auth: authDisabled ? "disabled" : "supabase-bearer",
      activeSessions: sessions.size,
    });
  });

  const mcpPostHandler = async (req, res) => {
    try {
      const sessionId = headerString(req.headers["mcp-session-id"]);
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "MCP session not found." },
            id: null,
          });
          return;
        }

        if (!authDisabled) {
          assertSameSessionUser(session, req.auth);
        }

        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: initialize is required before session requests." },
          id: null,
        });
        return;
      }

      const userId = authDisabled ? defaultUserId() || "anonymous" : userIdFromAuthInfo(req.auth);
      if (!userId) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Missing authenticated Supabase user." },
          id: null,
        });
        return;
      }

      let transport;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          sessions.set(initializedSessionId, {
            transport,
            server,
            userId,
          });
        },
      });

      const server = createAiVideoInsightMcpServer();
      transport.onclose = async () => {
        const initializedSessionId = transport.sessionId;
        if (initializedSessionId) {
          sessions.delete(initializedSessionId);
        }
        await server.close().catch(() => undefined);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[mcp] Streamable HTTP POST failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        });
      }
    }
  };

  const mcpSessionHandler = async (req, res) => {
    try {
      const sessionId = headerString(req.headers["mcp-session-id"]);
      const session = sessionId ? sessions.get(sessionId) : null;
      if (!session) {
        res.status(400).send("Invalid or missing MCP session id.");
        return;
      }

      if (!authDisabled) {
        assertSameSessionUser(session, req.auth);
      }

      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error(`[mcp] Streamable HTTP ${req.method} failed:`, error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error.");
      }
    }
  };

  if (authMiddleware) {
    app.post("/mcp", authMiddleware, mcpPostHandler);
    app.get("/mcp", authMiddleware, mcpSessionHandler);
    app.delete("/mcp", authMiddleware, mcpSessionHandler);
  } else {
    app.post("/mcp", mcpPostHandler);
    app.get("/mcp", mcpSessionHandler);
    app.delete("/mcp", mcpSessionHandler);
  }

  const httpServer = app.listen(port, host, () => {
    console.error(
      `[mcp] ${SERVER_NAME} ${SERVER_VERSION} is running over Streamable HTTP at http://${host}:${port}/mcp.`,
    );
    if (authDisabled) {
      console.error("[mcp] WARNING: MCP_HTTP_AUTH_DISABLED is enabled. Do not use this mode for deployment.");
    }
  });

  httpServer.on("error", (error) => {
    console.error("[mcp] Failed to start Streamable HTTP server:", error);
    process.exit(1);
  });

  const shutdown = async () => {
    console.error("[mcp] Shutting down Streamable HTTP server...");
    for (const [sessionId, session] of sessions) {
      await session.transport.close().catch(() => undefined);
      await session.server.close().catch(() => undefined);
      sessions.delete(sessionId);
    }
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const transport = readEnv("MCP_TRANSPORT").toLowerCase();
  if (transport === "http" || transport === "streamable-http" || process.argv.includes("--http")) {
    await runStreamableHttpServer();
    return;
  }

  await runStdioServer();
}

main().catch((error) => {
  console.error("[mcp] Server failed:", error);
  process.exit(1);
});
