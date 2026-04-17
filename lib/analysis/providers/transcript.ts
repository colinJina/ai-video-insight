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
  normalizeTranscriptText,
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
      text: `This segment introduces "${title}", explains the background, and frames the most important question to watch for.`,
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "The next section breaks the topic into smaller layers, compares the current state with common mistakes, and explains where older approaches start to fail.",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "The middle of the video lays out a more systematic method, including how to define the goal, organize inputs, and turn them into concrete outputs.",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "A concrete example or scenario then shows what changes after the method is applied and which signals matter when judging whether it works.",
    },
    {
      startSeconds: null,
      endSeconds: null,
      text: "The ending shifts back to decision making and reminds the viewer to balance speed with risk, constraints, and room for iteration.",
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
      language: "en",
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
  const text = normalizeTranscriptText(rawText);

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
    throw new ExternalServiceError("The transcript service returned a response that could not be parsed.");
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
    throw new ExternalServiceError("The transcript service did not return any usable transcript segments.");
  }

  const hasRealTimeline = segments.some(
    (segment) =>
      hasUsableTimestamp(segment.startSeconds) || hasUsableTimestamp(segment.endSeconds),
  );

  if (!hasRealTimeline) {
    throw new ExternalServiceError("The transcript service returned text but no usable timestamps.");
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
    throw new ExternalServiceError("AssemblyAI returned a response that could not be parsed.");
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
      const normalizedText = normalizeTranscriptText(text);
      if (!normalizedText) {
        return null;
      }

      return {
        startSeconds: millisecondsToSeconds(item.start),
        endSeconds: millisecondsToSeconds(item.end),
        text: normalizedText,
      } satisfies TranscriptSegment;
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);

  if (segments.length === 0) {
    throw new ExternalServiceError("AssemblyAI did not return any usable timestamped segments.");
  }

  const hasRealTimeline = segments.some(
    (segment) =>
      hasUsableTimestamp(segment.startSeconds) || hasUsableTimestamp(segment.endSeconds),
  );

  if (!hasRealTimeline) {
    throw new ExternalServiceError("AssemblyAI returned text but no usable timestamps.");
  }

  const fullText =
    typeof payload.text === "string" && normalizeTranscriptText(payload.text)
      ? normalizeTranscriptText(payload.text)
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

  private static readonly MAX_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
  private static readonly UNKNOWN_DURATION_TIMEOUT_MS = 10 * 60 * 1000;
  private static readonly POLL_REQUEST_TIMEOUT_MS = 30 * 1000;

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

  private getProcessingTimeoutMs(video: VideoSource) {
    if (
      typeof video.durationSeconds !== "number" ||
      !Number.isFinite(video.durationSeconds) ||
      video.durationSeconds <= 0
    ) {
      return Math.max(
        this.timeoutMs,
        AssemblyAiTranscriptProvider.UNKNOWN_DURATION_TIMEOUT_MS,
      );
    }

    const durationScaledTimeoutMs = Math.ceil(video.durationSeconds * 1000 * 0.75) + 60_000;

    return Math.min(
      Math.max(this.timeoutMs, durationScaledTimeoutMs),
      AssemblyAiTranscriptProvider.MAX_PROCESSING_TIMEOUT_MS,
    );
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

  private async submitTranscript(audioUrl: string, timeoutMs: number) {
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
      timeoutMs,
    );

    const rawBody = await response.text();
    let body: unknown = null;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new ExternalServiceError("AssemblyAI returned a response that could not be parsed.");
    }

    if (!response.ok) {
      const message =
        isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.message === "string"
          ? body.error.message
          : isRecord(body) && typeof body.error === "string"
            ? body.error
            : `AssemblyAI submission failed with status ${response.status}.`;

      throw new ExternalServiceError(message, true);
    }

    if (!isRecord(body) || typeof body.id !== "string" || !body.id) {
      throw new ExternalServiceError("AssemblyAI did not return a valid transcript id.");
    }

    return body.id;
  }

  private async pollTranscript(id: string, timeoutMs: number) {
    const pollingEndpoint = joinUrl(this.transcriptEndpoint, id);
    const startedAt = Date.now();
    const pollRequestTimeoutMs = Math.min(
      timeoutMs,
      AssemblyAiTranscriptProvider.POLL_REQUEST_TIMEOUT_MS,
    );

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetchWithTimeout(
        pollingEndpoint,
        {
          headers: {
            Authorization: this.apiKey,
          },
        },
        pollRequestTimeoutMs,
      );

      const rawBody = await response.text();
      let body: unknown = null;

      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        throw new ExternalServiceError("AssemblyAI returned a polling response that could not be parsed.");
      }

      if (!response.ok) {
        const message =
          isRecord(body) &&
          isRecord(body.error) &&
          typeof body.error.message === "string"
            ? body.error.message
            : isRecord(body) && typeof body.error === "string"
              ? body.error
              : `AssemblyAI polling failed with status ${response.status}.`;

        throw new ExternalServiceError(message, true);
      }

      if (!isRecord(body) || typeof body.status !== "string") {
        throw new ExternalServiceError("AssemblyAI returned a response without a status field.");
      }

      if (body.status === "completed") {
        return normalizeAssemblyAiPayload(body);
      }

      if (body.status === "error") {
        const errorMessage =
          typeof body.error === "string" ? body.error : "AssemblyAI transcript generation failed.";
        throw new ExternalServiceError(errorMessage, true);
      }

      await sleep(this.pollIntervalMs);
    }

    throw new ExternalServiceError("AssemblyAI transcript generation timed out. Please try again later.", true);
  }

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    try {
      const processingTimeoutMs = this.getProcessingTimeoutMs(video);
      const prepared = await prepareTranscriptMedia(
        video,
        async ({ filePath, contentType }) =>
          this.uploadLocalMedia(filePath, contentType),
      );

      try {
        const transcriptId = await this.submitTranscript(
          prepared.audioUrl,
          processingTimeoutMs,
        );
        const transcript = await this.pollTranscript(
          transcriptId,
          processingTimeoutMs,
        );

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
        throw new ExternalServiceError("The transcript service returned a response that could not be parsed.");
      }

      if (!response.ok) {
        const message =
          isRecord(body) &&
          isRecord(body.error) &&
          typeof body.error.message === "string"
            ? body.error.message
            : `The transcript service returned status ${response.status}.`;

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
      "TRANSCRIPT_PROVIDER=assemblyai requires TRANSCRIPT_API_KEY or ASSEMBLYAI_API_KEY to be configured.",
      true,
    );
  }

  if (explicitProvider === "remote") {
    throw new ExternalServiceError(
      "TRANSCRIPT_PROVIDER=remote requires a transcript service API key. Generic remote mode also requires TRANSCRIPT_API_BASE_URL.",
      true,
    );
  }

  return new MockTranscriptProvider();
}
