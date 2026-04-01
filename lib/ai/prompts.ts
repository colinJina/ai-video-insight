import type {
  ChatWithVideoContextInput,
  GenerateVideoSummaryInput,
} from "@/lib/analysis/types";
import {
  buildTranscriptExcerpt,
  formatTimestamp,
  hasUsableTimestamp,
} from "@/lib/analysis/utils";

export function buildVideoSummarySystemPrompt() {
  return [
    "You are a video analysis assistant.",
    "Strictly use the provided transcript to produce a structured analysis result.",
    "Return exactly one valid JSON object and do not include Markdown, code fences, or extra commentary.",
    'The JSON shape must be: {"title":"string","summary":"string","outline":[{"time":"MM:SS|null","text":"string"}],"keyPoints":["string"],"suggestedQuestions":["string"]}',
    "Requirements:",
    "1. Write the summary in English and keep it between 120 and 220 words.",
    "2. Provide at least 3 outline items. Only include a timestamp when the transcript clearly contains it; otherwise use null.",
    "3. Never invent timestamps or rewrite chapter order into fake MM:SS precision.",
    "4. Return 3 to 5 key points.",
    "5. Return 3 to 5 suggested follow-up questions.",
  ].join("\n");
}

export function buildVideoSummaryUserPrompt(input: GenerateVideoSummaryInput) {
  return JSON.stringify(
    {
      video: {
        title: input.video.title,
        sourceUrl: input.video.normalizedUrl,
        host: input.video.host,
        provider: input.video.provider,
        durationSeconds: input.video.durationSeconds,
      },
      transcript: {
        language: input.transcript.language,
        segments: input.transcript.segments.map((segment) => ({
          time: (() => {
            const startSeconds = segment.startSeconds;
            return hasUsableTimestamp(startSeconds)
              ? formatTimestamp(startSeconds)
              : null;
          })(),
          text: segment.text,
        })),
        fullText: input.transcript.fullText,
      },
    },
    null,
    2,
  );
}

export function buildChatSystemPrompt() {
  return [
    "You are a video Q&A assistant.",
    "Answer the user only from the provided summary, outline, key points, and transcript context.",
    "If the context is insufficient for a confident answer, say so clearly and do not invent details.",
    "Respond in English by default.",
    "When a question refers to a specific segment, only cite timestamps that actually exist in the transcript.",
    "If the current analysis has no usable timestamps, do not fabricate or guess them.",
    "Keep the answer concise, specific, and actionable.",
  ].join("\n");
}

export function buildChatUserPrompt(input: ChatWithVideoContextInput) {
  return JSON.stringify(
    {
      question: input.question,
      video: {
        title: input.video.title,
        sourceUrl: input.video.normalizedUrl,
      },
      analysis: {
        summary: input.analysis.summary,
        outline: input.analysis.outline,
        keyPoints: input.analysis.keyPoints,
      },
      transcriptExcerpt: buildTranscriptExcerpt(input.transcript.segments, 2400),
      recentMessages: input.messages.slice(-6).map((message) => ({
        role: message.role,
        content: message.content,
      })),
    },
    null,
    2,
  );
}
