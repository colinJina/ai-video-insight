import type {
  AnalysisResult,
  GenerateVideoSummaryInput,
  StructuredVideoSummary,
  TranscriptSegment,
} from "@/lib/analysis/types";
import {
  coerceTimestamp,
  formatTimestamp,
  hasUsableTimestamp,
  isRecord,
  normalizeWhitespace,
  pickStringArray,
  trimText,
} from "@/lib/analysis/utils";

function segmentToOutlineText(segment: TranscriptSegment) {
  return trimText(segment.text, 72);
}

function buildDefaultQuestions(title: string) {
  return [
    `What is the most important conclusion from this video about "${title}"?`,
    "If I only have a minute to review it, which timestamps matter most?",
    "What actions or decisions can I take directly from this content?",
  ];
}

function formatOutlineTime(segment: TranscriptSegment) {
  const startSeconds = segment.startSeconds;
  return hasUsableTimestamp(startSeconds) ? formatTimestamp(startSeconds) : null;
}

export function buildFallbackStructuredSummary(
  input: GenerateVideoSummaryInput,
): StructuredVideoSummary {
  const outline = input.transcript.segments.slice(0, 6).map((segment) => ({
    time: formatOutlineTime(segment),
    text: segmentToOutlineText(segment),
  }));

  const keyPoints = outline.map((item) => item.text).slice(0, 4);
  const summarySource = input.transcript.segments
    .slice(0, 3)
    .map((segment) => segment.text)
    .join(" ");

  return {
    title: input.video.title,
    summary: trimText(
      `This video centers on "${input.video.title}" and moves through the problem framing, the working method, and the final conclusion. ${summarySource}`,
      240,
    ),
    outline,
    keyPoints,
    suggestedQuestions: buildDefaultQuestions(input.video.title),
  };
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function createValidOutlineTimes(input: GenerateVideoSummaryInput) {
  return new Set(
    input.transcript.segments
      .map((segment) => formatOutlineTime(segment))
      .filter((time): time is string => typeof time === "string"),
  );
}

export function normalizeStructuredSummary(
  value: unknown,
  fallback: StructuredVideoSummary,
  validOutlineTimes: Set<string>,
): StructuredVideoSummary {
  if (!isRecord(value)) {
    return fallback;
  }

  const rawOutline = Array.isArray(value.outline) ? value.outline : [];
  const outline = rawOutline
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const fallbackTime = fallback.outline[index]?.time ?? null;
      const text =
        typeof item.text === "string" ? normalizeWhitespace(item.text) : "";

      if (!text) {
        return null;
      }

      const candidateTime = coerceTimestamp(item.time, fallbackTime);
      const normalizedTime =
        candidateTime && validOutlineTimes.has(candidateTime)
          ? candidateTime
          : fallbackTime;

      return {
        time: normalizedTime,
        text: trimText(text, 88),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 8);

  const keyPoints = pickStringArray(value.keyPoints, 6);
  const suggestedQuestions = pickStringArray(value.suggestedQuestions, 6);

  return {
    title:
      typeof value.title === "string" && normalizeWhitespace(value.title)
        ? trimText(normalizeWhitespace(value.title), 96)
        : fallback.title,
    summary:
      typeof value.summary === "string" && normalizeWhitespace(value.summary)
        ? trimText(normalizeWhitespace(value.summary), 400)
        : fallback.summary,
    outline: outline.length > 0 ? outline : fallback.outline,
    keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
    suggestedQuestions:
      suggestedQuestions.length > 0
        ? suggestedQuestions
        : fallback.suggestedQuestions,
  };
}

export function safeParseStructuredSummary(
  raw: string,
  input: GenerateVideoSummaryInput,
) {
  const fallback = buildFallbackStructuredSummary(input);
  const parsed = parseJsonObject(raw);

  return normalizeStructuredSummary(parsed, fallback, createValidOutlineTimes(input));
}

export function buildAnalysisResult(summary: StructuredVideoSummary): AnalysisResult {
  return {
    ...summary,
    chatContext: {
      intro: `I finished the first-pass analysis for this video. The quick read is: ${summary.summary}`,
      suggestedQuestions:
        summary.suggestedQuestions.length > 0
          ? summary.suggestedQuestions
          : buildDefaultQuestions(summary.title),
    },
    chatState: {
      conversationSummary: null,
      memoryItems: [],
    },
  };
}
