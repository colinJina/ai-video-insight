import { ExternalServiceError } from "@/lib/analysis/errors";
import {
  prepareTranscriptMedia,
  uploadFileToUrl,
} from "@/lib/analysis/media-resolver";
import type {
  TranscriptData,
  TranscriptProvider,
  TranscriptSegment,
  VideoSource,
} from "@/lib/analysis/types";
import {
  fetchWithTimeout,
  hasUsableTimestamp,
  isRecord,
  normalizeDurationSeconds,
  normalizeWhitespace,
  sleep,
  trimText,
} from "@/lib/analysis/utils";

const DEFAULT_ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com";
const DEFAULT_POLL_INTERVAL_MS = 3000;

function buildMockTranscriptSegments(video: VideoSource): TranscriptSegment[] {
  const title = trimText(video.title, 40);

  return [
    {
      startSeconds: null,
      endSeconds: null,
      text: `这段内容围绕“${title}”展开，先说明主题背景、观看价值以及最值得关注的核心问题。`,
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "随后视频把问题拆成几个层次，先讲现状与常见误区，再解释为什么传统做法在效率和协同上会遇到瓶颈。",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "中段给出了更系统的方法论，包括如何定义目标、组织信息，以及怎样把输入转成可执行的输出。",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "接着通过案例或场景推演，展示方案落地后的变化，并强调哪些指标最能帮助判断方案是否有效。",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "结尾回到决策层视角，提醒观众在推进这件事时既要关注效率，也要关注风险、边界和后续迭代空间。",
    },
  ];
}

class MockTranscriptProvider implements TranscriptProvider {
  readonly kind = "mock" as const;

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    const delayMs = Number(process.env.ANALYSIS_MOCK_DELAY_MS ?? 1200);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await sleep(delayMs);
    }

    const segments = buildMockTranscriptSegments(video);

    return {
      source: "mock",
      language: "zh-CN",
      fullText: segments.map((segment) => segment.text).join(" "),
      segments,
    };
  }
}

type RemoteTranscriptResponse = {
  language: string;
  segments: TranscriptSegment[];
  fullText: string;
};

function normalizeTranscriptSegment(value: unknown): TranscriptSegment | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawText =
    typeof value.text === "string"
      ? value.text
      : typeof value.transcript === "string"
        ? value.transcript
        : typeof value.content === "string"
          ? value.content
          : "";
  const text = normalizeWhitespace(rawText);

  if (!text) {
    return null;
  }

  const startSeconds =
    normalizeDurationSeconds(value.startSeconds) ??
    normalizeDurationSeconds(value.start) ??
    normalizeDurationSeconds(value.start_time) ??
    normalizeDurationSeconds(value.from);
  const endSeconds =
    normalizeDurationSeconds(value.endSeconds) ??
    normalizeDurationSeconds(value.end) ??
    normalizeDurationSeconds(value.end_time) ??
    normalizeDurationSeconds(value.to);

  return {
    startSeconds,
    endSeconds,
    text,
  };
}

function normalizeRemoteTranscriptPayload(payload: unknown): RemoteTranscriptResponse {
  const root = isRecord(payload) && isRecord(payload.transcript) ? payload.transcript : payload;

  if (!isRecord(root)) {
    throw new ExternalServiceError("Transcript 服务返回了无法解析的响应。");
  }

  const rawSegments = Array.isArray(root.segments)
    ? root.segments
    : Array.isArray(root.chunks)
      ? root.chunks
      : Array.isArray(root.items)
        ? root.items
        : [];
  const segments = rawSegments
    .map((segment) => normalizeTranscriptSegment(segment))
    .filter((segment): segment is TranscriptSegment => segment !== null);

  if (segments.length === 0) {
    throw new ExternalServiceError("Transcript 服务没有返回可用的分段结果。");
  }

  const hasRealTimeline = segments.some(
    (segment) =>
      hasUsableTimestamp(segment.startSeconds) || hasUsableTimestamp(segment.endSeconds),
  );

  if (!hasRealTimeline) {
    throw new ExternalServiceError("Transcript 服务返回了文本，但没有返回可用的时间戳。");
  }

  const fullText =
    typeof root.fullText === "string" && normalizeWhitespace(root.fullText)
      ? normalizeWhitespace(root.fullText)
      : segments.map((segment) => segment.text).join(" ");
  const language =
    typeof root.language === "string" && normalizeWhitespace(root.language)
      ? normalizeWhitespace(root.language)
      : "und";

  return {
    language,
    segments,
    fullText,
  };
}

function millisecondsToSeconds(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric / 1000 : null;
}

function normalizeAssemblyAiPayload(payload: unknown): RemoteTranscriptResponse {
  if (!isRecord(payload)) {
    throw new ExternalServiceError("AssemblyAI 返回了无法解析的响应。");
  }

  const utterances = Array.isArray(payload.utterances) ? payload.utterances : [];
  const words = Array.isArray(payload.words) ? payload.words : [];
  const sourceItems = utterances.length > 0 ? utterances : words;
  const segments = sourceItems
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = typeof item.text === "string" ? normalizeWhitespace(item.text) : "";
      if (!text) {
        return null;
      }

      return {
        startSeconds: millisecondsToSeconds(item.start),
        endSeconds: millisecondsToSeconds(item.end),
        text,
      } satisfies TranscriptSegment;
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);

  if (segments.length === 0) {
    throw new ExternalServiceError("AssemblyAI 没有返回可用的带时间戳分段。");
  }

  const hasRealTimeline = segments.some(
    (segment) =>
      hasUsableTimestamp(segment.startSeconds) || hasUsableTimestamp(segment.endSeconds),
  );

  if (!hasRealTimeline) {
    throw new ExternalServiceError("AssemblyAI 返回了文本，但没有可用的时间戳。");
  }

  const fullText =
    typeof payload.text === "string" && normalizeWhitespace(payload.text)
      ? normalizeWhitespace(payload.text)
      : segments.map((segment) => segment.text).join(" ");
  const language =
    typeof payload.language_code === "string" && normalizeWhitespace(payload.language_code)
      ? normalizeWhitespace(payload.language_code)
      : "und";

  return {
    language,
    segments,
    fullText,
  };
}

function joinUrl(baseUrl: string, path: string) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  return url.toString();
}

class AssemblyAiTranscriptProvider implements TranscriptProvider {
  readonly kind = "remote" as const;

  private readonly transcriptEndpoint: string;
  private readonly uploadEndpoint: string;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    private readonly speechModels: string[],
    private readonly timeoutMs: number,
    private readonly fallbackToMock: boolean,
    private readonly pollIntervalMs: number,
  ) {
    this.transcriptEndpoint = joinUrl(baseUrl, "/v2/transcript");
    this.uploadEndpoint = joinUrl(baseUrl, "/v2/upload");
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: this.apiKey,
    };
  }

  private async uploadLocalMedia(filePath: string, contentType?: string) {
    return uploadFileToUrl(
      this.uploadEndpoint,
      this.apiKey,
      {
        filePath,
        contentType,
      },
      Math.max(this.timeoutMs, 5 * 60 * 1000),
    );
  }

  private async submitTranscript(audioUrl: string) {
    const response = await fetchWithTimeout(
      this.transcriptEndpoint,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          audio_url: audioUrl,
          speech_models: this.speechModels,
          language_detection: true,
          format_text: true,
          auto_chapters: false,
          punctuate: true,
          speaker_labels: true,
        }),
      },
      this.timeoutMs,
    );

    const rawBody = await response.text();
    let body: unknown = null;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new ExternalServiceError("AssemblyAI 返回了无法解析的响应。");
    }

    if (!response.ok) {
      const message =
        isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.message === "string"
          ? body.error.message
          : isRecord(body) && typeof body.error === "string"
            ? body.error
            : `AssemblyAI 提交任务失败，状态码 ${response.status}。`;

      throw new ExternalServiceError(message, true);
    }

    if (!isRecord(body) || typeof body.id !== "string" || !body.id) {
      throw new ExternalServiceError("AssemblyAI 没有返回有效的 transcript id。");
    }

    return body.id;
  }

  private async pollTranscript(id: string) {
    const pollingEndpoint = joinUrl(this.transcriptEndpoint, id);
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      const response = await fetchWithTimeout(
        pollingEndpoint,
        {
          headers: {
            Authorization: this.apiKey,
          },
        },
        this.timeoutMs,
      );

      const rawBody = await response.text();
      let body: unknown = null;

      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        throw new ExternalServiceError("AssemblyAI 返回了无法解析的轮询响应。");
      }

      if (!response.ok) {
        const message =
          isRecord(body) &&
          isRecord(body.error) &&
          typeof body.error.message === "string"
            ? body.error.message
            : isRecord(body) && typeof body.error === "string"
              ? body.error
              : `AssemblyAI 轮询失败，状态码 ${response.status}。`;

        throw new ExternalServiceError(message, true);
      }

      if (!isRecord(body) || typeof body.status !== "string") {
        throw new ExternalServiceError("AssemblyAI 返回了缺少状态字段的响应。");
      }

      if (body.status === "completed") {
        return normalizeAssemblyAiPayload(body);
      }

      if (body.status === "error") {
        const errorMessage =
          typeof body.error === "string" ? body.error : "AssemblyAI 转写任务失败。";
        throw new ExternalServiceError(errorMessage, true);
      }

      await sleep(this.pollIntervalMs);
    }

    throw new ExternalServiceError("AssemblyAI 转写超时，请稍后重试。", true);
  }

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    try {
      const prepared = await prepareTranscriptMedia(
        video,
        async ({ filePath, contentType }) =>
          this.uploadLocalMedia(filePath, contentType),
      );

      try {
        const transcriptId = await this.submitTranscript(prepared.audioUrl);
        const transcript = await this.pollTranscript(transcriptId);

        return {
          source: "remote",
          language: transcript.language,
          fullText: transcript.fullText,
          segments: transcript.segments,
        };
      } finally {
        await prepared.cleanup().catch(() => undefined);
      }
    } catch (error) {
      if (this.fallbackToMock) {
        return new MockTranscriptProvider().getTranscript({ video });
      }

      throw error;
    }
  }
}

class GenericRemoteTranscriptProvider implements TranscriptProvider {
  readonly kind = "remote" as const;

  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string | null,
    baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fallbackToMock: boolean,
  ) {
    this.endpoint = joinUrl(baseUrl, "/transcripts");
  }

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    try {
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
            video: {
              url: video.normalizedUrl,
              playableUrl: video.playableUrl,
              provider: video.provider,
              title: video.title,
              durationSeconds: video.durationSeconds,
            },
          }),
        },
        this.timeoutMs,
      );

      const rawBody = await response.text();
      let body: unknown = null;

      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        throw new ExternalServiceError("Transcript 服务返回了无法解析的响应。");
      }

      if (!response.ok) {
        const message =
          isRecord(body) &&
          isRecord(body.error) &&
          typeof body.error.message === "string"
            ? body.error.message
            : `Transcript 服务返回了 ${response.status} 错误。`;

        throw new ExternalServiceError(message, true);
      }

      const transcript = normalizeRemoteTranscriptPayload(body);

      return {
        source: "remote",
        language: transcript.language,
        fullText: transcript.fullText,
        segments: transcript.segments,
      };
    } catch (error) {
      if (this.fallbackToMock) {
        return new MockTranscriptProvider().getTranscript({ video });
      }

      throw error;
    }
  }
}

export function createTranscriptProvider(): TranscriptProvider {
  const explicitProvider = (process.env.TRANSCRIPT_PROVIDER ?? "").toLowerCase();
  const apiKey = process.env.TRANSCRIPT_API_KEY ?? process.env.ASSEMBLYAI_API_KEY;
  const configuredSpeechModels =
    process.env.ASSEMBLYAI_SPEECH_MODELS ??
    process.env.TRANSCRIPT_MODELS ??
    process.env.TRANSCRIPT_MODEL ??
    process.env.ASSEMBLYAI_SPEECH_MODEL ??
    "";
  const speechModels = configuredSpeechModels
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const resolvedSpeechModels =
    speechModels.length > 0 ? speechModels : ["universal-3-pro", "universal-2"];
  const timeoutMs = Number(process.env.TRANSCRIPT_TIMEOUT_MS ?? 120000);
  const fallbackToMock =
    (process.env.TRANSCRIPT_REMOTE_FALLBACK_TO_MOCK ?? "false").toLowerCase() ===
    "true";
  const pollIntervalMs = Number(
    process.env.TRANSCRIPT_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS,
  );
  const baseUrl =
    process.env.TRANSCRIPT_API_BASE_URL ??
    process.env.ASSEMBLYAI_BASE_URL ??
    DEFAULT_ASSEMBLYAI_BASE_URL;

  if (explicitProvider === "mock") {
    return new MockTranscriptProvider();
  }

  if ((explicitProvider === "assemblyai" || explicitProvider === "remote") && apiKey) {
    if (explicitProvider === "remote" && process.env.TRANSCRIPT_API_BASE_URL) {
      return new GenericRemoteTranscriptProvider(
        apiKey,
        resolvedSpeechModels[0] ?? null,
        process.env.TRANSCRIPT_API_BASE_URL,
        timeoutMs,
        fallbackToMock,
      );
    }

    return new AssemblyAiTranscriptProvider(
      apiKey,
      baseUrl,
      resolvedSpeechModels,
      timeoutMs,
      fallbackToMock,
      pollIntervalMs,
    );
  }

  if (explicitProvider === "assemblyai") {
    throw new ExternalServiceError(
      "TRANSCRIPT_PROVIDER=assemblyai 时必须配置 TRANSCRIPT_API_KEY 或 ASSEMBLYAI_API_KEY。",
      true,
    );
  }

  if (explicitProvider === "remote") {
    throw new ExternalServiceError(
      "TRANSCRIPT_PROVIDER=remote 时必须配置可用的 transcript 服务密钥；若走通用 remote，还需要 TRANSCRIPT_API_BASE_URL。",
      true,
    );
  }

  return new MockTranscriptProvider();
}
