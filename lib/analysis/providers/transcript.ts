import { ExternalServiceError } from "@/lib/analysis/errors";
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

function resolveTranscriptEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  const trimmedPath = url.pathname.replace(/\/$/, "");

  if (trimmedPath === "" || trimmedPath === "/" || trimmedPath.endsWith("/v1")) {
    url.pathname = `${trimmedPath}/transcripts`.replace("//", "/");
  }

  return url.toString();
}

class RemoteTranscriptProvider implements TranscriptProvider {
  readonly kind = "remote" as const;

  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fallbackToMock: boolean,
  ) {
    this.endpoint = resolveTranscriptEndpoint(baseUrl);
  }

  private async requestTranscript(video: VideoSource) {
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

    return normalizeRemoteTranscriptPayload(body);
  }

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    try {
      const transcript = await this.requestTranscript(video);

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
  const baseUrl = process.env.TRANSCRIPT_API_BASE_URL;
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  const model = process.env.TRANSCRIPT_MODEL;
  const timeoutMs = Number(process.env.TRANSCRIPT_TIMEOUT_MS ?? 45000);
  const fallbackToMock =
    (process.env.TRANSCRIPT_REMOTE_FALLBACK_TO_MOCK ?? "false").toLowerCase() ===
    "true";

  if (explicitProvider === "mock") {
    return new MockTranscriptProvider();
  }

  if (baseUrl && apiKey && model) {
    return new RemoteTranscriptProvider(
      apiKey,
      model,
      baseUrl,
      timeoutMs,
      fallbackToMock,
    );
  }

  if (explicitProvider === "remote") {
    throw new ExternalServiceError(
      "TRANSCRIPT_PROVIDER=remote 时必须同时配置 TRANSCRIPT_API_BASE_URL、TRANSCRIPT_API_KEY 和 TRANSCRIPT_MODEL。",
      true,
    );
  }

  return new MockTranscriptProvider();
}
