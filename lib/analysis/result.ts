import type {
  AnalysisResult,
  GenerateVideoSummaryInput,
  StructuredVideoSummary,
  TranscriptSegment,
} from "@/lib/analysis/types";
import {
  coerceTimestamp,
  formatTimestamp,
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
    `这段关于《${title}》的视频最重要的结论是什么？`,
    "如果我要快速回看，应该优先看哪几个时间点？",
    "这段内容里有哪些可以直接落地的做法？",
  ];
}

export function buildFallbackStructuredSummary(
  input: GenerateVideoSummaryInput,
): StructuredVideoSummary {
  const outline = input.transcript.segments.slice(0, 6).map((segment, index) => ({
    time: formatTimestamp(segment.startSeconds || index * 90),
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
      `这段视频围绕“${input.video.title}”展开，重点讨论了背景、方法与结论三个层面。${summarySource}`,
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

export function normalizeStructuredSummary(
  value: unknown,
  fallback: StructuredVideoSummary,
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

      const fallbackTime =
        fallback.outline[index]?.time ?? formatTimestamp(index * 90);
      const text =
        typeof item.text === "string" ? normalizeWhitespace(item.text) : "";

      if (!text) {
        return null;
      }

      return {
        time: coerceTimestamp(item.time, fallbackTime),
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

  return normalizeStructuredSummary(parsed, fallback);
}

export function buildAnalysisResult(
  summary: StructuredVideoSummary,
): AnalysisResult {
  return {
    ...summary,
    chatContext: {
      intro: `我已经完成这段视频的首轮分析。快速结论是：${summary.summary}`,
      suggestedQuestions:
        summary.suggestedQuestions.length > 0
          ? summary.suggestedQuestions
          : buildDefaultQuestions(summary.title),
    },
  };
}
